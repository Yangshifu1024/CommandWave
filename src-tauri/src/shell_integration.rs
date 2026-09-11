//! Shell integration injection.
//!
//! Terminals only learn the shell's working directory when the shell reports
//! it via OSC 7 ("file://host/path"), and only learn command boundaries when
//! the shell reports them via OSC 133 (FinalTerm-style prompt marks: A =
//! prompt start, C = command executing, D;exit = command finished). Stock
//! shells emit neither, so following the VS Code/WezTerm approach we inject
//! a small integration script:
//!
//! - zsh: point `ZDOTDIR` at a generated directory whose rc files chain to
//!   the user's own config, then add `precmd`/`preexec` hooks that emit
//!   OSC 7 + OSC 133.
//! - bash: `PROMPT_COMMAND` and `PS0` are set in the environment
//!   (interactive bash honors inherited values).
//! - PowerShell: `-NoExit -Command` boots a `Prompt` /
//!   `PSConsoleHostReadLine` pair that emits the same marks (no $PROFILE
//!   edits; the init runs after the user's profile).
//!
//! Emission is guarded on `TERM_PROGRAM == "CommandWave"` so nested shells
//! and other terminals are unaffected. In prompt "blocks" mode the shell's
//! own prompt is kept empty — the app's native input card renders it.

use std::fs;
use std::path::{Path, PathBuf};

use anyhow::Context;

const ZSHRC: &str = r#"# CommandWave shell integration: report cwd (OSC 7) and prompt marks (OSC 133).
if [[ $TERM_PROGRAM == "CommandWave" && -z $CW_SHELL_INTEGRATION ]]; then
  export CW_SHELL_INTEGRATION=1
  # ZDOTDIR points at this generated directory; chain to the user's config.
  if [[ -n $CW_ORIG_ZDOTDIR && -r $CW_ORIG_ZDOTDIR/.zshrc ]]; then
    source "$CW_ORIG_ZDOTDIR/.zshrc"
  elif [[ -r $HOME/.zshrc ]]; then
    source "$HOME/.zshrc"
  fi
  __commandwave_precmd() {
    # $? must be captured before anything else runs.
    local __cw_exit=$?
{{CW_HIDE_PROMPT}}
    builtin printf '\e]133;D;%d\a' "$__cw_exit"
    builtin printf '\e]133;A\a'
    builtin printf '\e]7;file://%s%s\a' "$HOST" "$PWD"
  }
  __commandwave_preexec() {
    builtin printf '\e]133;C\a'
  }
  typeset -ga precmd_functions
  precmd_functions+=(__commandwave_precmd)
  typeset -ga preexec_functions
  preexec_functions+=(__commandwave_preexec)
fi
"#;

/// Injected at `{{CW_HIDE_PROMPT}}` in blocks mode: the native input card
/// renders the prompt, so the shell's own stays invisible. Our precmd hook
/// is registered after the user's config, so it runs last and wins.
const HIDE_ZSH_PROMPT: &str = "    # Block model: the app's input card renders the prompt.\n    PROMPT=''\n    RPROMPT=''";

macro_rules! zsh_passthrough {
    ($name:literal) => {
        concat!(
            "# CommandWave passthrough for ",
            $name,
            "\nif [[ -n $CW_ORIG_ZDOTDIR && -r $CW_ORIG_ZDOTDIR/",
            $name,
            " ]]; then\n  source \"$CW_ORIG_ZDOTDIR/",
            $name,
            "\"\nelif [[ -r $HOME/",
            $name,
            " ]]; then\n  source \"$HOME/",
            $name,
            "\"\nfi\n"
        )
    };
}

/// bash: PS0's value is *printed* (prompt-expanded, not executed) after a
/// command line is read but before it runs — so embed the escape bytes
/// directly instead of going through printf.
const BASH_PS0: &str = "\x1b]133;C\x07";

/// bash: the whole OSC 133/7 emission chained before every prompt. The
/// command's exit status is captured as the first statement so nothing can
/// clobber $? before the D mark reports it.
const BASH_PROMPT_COMMAND: &str = "__CW_E=$?; printf '\\e]133;D;%d\\a' \"$__CW_E\"; printf '\\e]133;A\\a'; printf '\\e]7;file://%s%s\\a' \"${HOSTNAME%%.*}\" \"$PWD\"";

/// bash in blocks mode: also keep the shell's own prompt empty. Runs before
/// every prompt (i.e. after the user's .bashrc), so it wins.
fn bash_prompt_command(blocks: bool) -> String {
    if blocks {
        format!("PS1=''; {BASH_PROMPT_COMMAND}")
    } else {
        BASH_PROMPT_COMMAND.to_string()
    }
}

/// PowerShell blocks-mode integration script: `Prompt` emits the D/A/OSC 7
/// marks and returns an empty string (the input card is the prompt);
/// `PSConsoleHostReadLine` emits the C mark once a line is accepted.
/// Uses `[char]27` so it works on Windows PowerShell 5.1 too (no `` `e ``).
const PWSH_INTEGRATION: &str = "$E=[char]27; $B=[char]7; function global:Prompt { $x=$global:LASTEXITCODE; if ($null -eq $x) { $x = 0 }; Write-Host -NoNewline ($E+']133;D;'+$x+$B+$E+']133;A'+$B+$E+']7;file://'+($PWD.ToString().Replace('\\','/'))+$B); '' }; function global:PSConsoleHostReadLine { $l=[Microsoft.PowerShell.PSConsoleReadLine]::ReadLine($Host.Runspace,$ExecutionContext); Write-Host -NoNewline ($E+']133;C'+$B); return $l }";

/// PowerShell startup arguments carrying the integration (blocks mode only —
/// without blocks there is nothing to inject; `-NoExit -Command` keeps the
/// user's profile running first).
pub fn powershell_args(blocks: bool) -> Option<Vec<String>> {
    if !blocks {
        return None;
    }
    Some(vec![
        "-NoExit".to_string(),
        "-Command".to_string(),
        PWSH_INTEGRATION.to_string(),
    ])
}

/// Shell family for integration purposes, from the program basename.
/// Explicitly configured shells of a supported family are integrated too;
/// unsupported shells (fish, nu, …) are left untouched.
pub fn shell_kind(program: &str) -> Option<&'static str> {
    let base = program.rsplit(['/', '\\']).next().unwrap_or(program);
    let lower = base.to_ascii_lowercase();
    let lower = lower.strip_suffix(".exe").unwrap_or(&lower);
    match lower {
        "zsh" => Some("zsh"),
        "bash" => Some("bash"),
        "pwsh" | "powershell" => Some("pwsh"),
        _ => None,
    }
}

/// Write the integration files under `<base>/shell-integration/` and return
/// the ZDOTDIR that should be set for zsh. Idempotent; rewritten on each call
/// so updates ship with the app.
pub fn write_integration_files(base: &Path, blocks: bool) -> Result<PathBuf, anyhow::Error> {
    let zdotdir = base.join("shell-integration").join("zsh");
    fs::create_dir_all(&zdotdir).context("creating shell integration dir")?;
    let hide = if blocks { HIDE_ZSH_PROMPT } else { "" };
    fs::write(zdotdir.join(".zshrc"), ZSHRC.replace("{{CW_HIDE_PROMPT}}", hide))?;
    fs::write(zdotdir.join(".zshenv"), zsh_passthrough!(".zshenv"))?;
    fs::write(zdotdir.join(".zprofile"), zsh_passthrough!(".zprofile"))?;
    fs::write(zdotdir.join(".zlogin"), zsh_passthrough!(".zlogin"))?;
    Ok(zdotdir)
}

/// Prepare environment for the given shell program. Returns the env vars to
/// set (`None` when the shell needs no / unsupported integration).
pub fn env_for_shell(
    program: &str,
    base: &Path,
    blocks: bool,
) -> Option<Vec<(String, String)>> {
    match shell_kind(program)? {
        "zsh" => {
            let zdotdir = write_integration_files(base, blocks).ok()?;
            let orig = std::env::var("ZDOTDIR").unwrap_or_default();
            Some(vec![
                ("ZDOTDIR".to_string(), zdotdir.to_string_lossy().into_owned()),
                ("CW_ORIG_ZDOTDIR".to_string(), orig),
            ])
        }
        "bash" => Some(vec![
            (
                "PROMPT_COMMAND".to_string(),
                bash_prompt_command(blocks),
            ),
            ("PS0".to_string(), BASH_PS0.to_string()),
        ]),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn integration_files_are_written() {
        let dir = std::env::temp_dir().join(format!("cw-int-test-{}", std::process::id()));
        let zdotdir = write_integration_files(&dir, false).expect("write integration files");
        assert!(zdotdir.join(".zshrc").exists());
        assert!(zdotdir.join(".zprofile").exists());
        let zshrc = fs::read_to_string(zdotdir.join(".zshrc")).unwrap();
        assert!(zshrc.contains("precmd_functions"));
        assert!(zshrc.contains("OSC 7"));
        assert!(zshrc.contains("OSC 133"));
        assert!(zshrc.contains("CW_ORIG_ZDOTDIR"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn zshrc_emits_prompt_marks_and_cwd() {
        let dir = std::env::temp_dir().join(format!("cw-int-marks-{}", std::process::id()));
        let zdotdir = write_integration_files(&dir, false).expect("write integration files");
        let zshrc = fs::read_to_string(zdotdir.join(".zshrc")).unwrap();
        // precmd: previous command finish (D with $?), then prompt start (A), then cwd.
        assert!(zshrc.contains(r"133;D;%d"));
        assert!(zshrc.contains(r"133;A"));
        assert!(zshrc.contains(r"133;C"));
        assert!(zshrc.contains(r"]7;file://%s%s"));
        // $? is captured as the first statement of the hook.
        assert!(zshrc.contains("local __cw_exit=$?"));
        // Off mode leaves the user's own prompt config alone.
        assert!(!zshrc.contains("PROMPT=''"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn zsh_blocks_mode_hides_prompt() {
        let dir = std::env::temp_dir().join(format!("cw-int-blocks-{}", std::process::id()));
        let zdotdir = write_integration_files(&dir, true).expect("write integration files");
        let zshrc = fs::read_to_string(zdotdir.join(".zshrc")).unwrap();
        assert!(zshrc.contains("PROMPT=''"));
        assert!(zshrc.contains("RPROMPT=''"));
        // The hide lines sit inside precmd, after $? is captured.
        assert!(zshrc.find("local __cw_exit=$?").unwrap() < zshrc.find("PROMPT=''").unwrap());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn bash_prompt_command_emits_marks() {
        let cmd = BASH_PROMPT_COMMAND;
        // Exit status is captured before anything else runs.
        assert!(cmd.contains("__CW_E=$?"));
        assert!(cmd.contains(r"133;D;%d"));
        assert!(cmd.contains(r"133;A"));
        assert!(cmd.contains(r"]7;file://%s%s"));
    }

    #[test]
    fn bash_blocks_mode_hides_ps1() {
        assert!(bash_prompt_command(true).starts_with("PS1='';"));
        assert!(!bash_prompt_command(false).contains("PS1=''"));
    }

    #[test]
    fn powershell_args_only_in_blocks_mode() {
        assert!(powershell_args(false).is_none());
        let args = powershell_args(true).expect("blocks mode injects args");
        assert_eq!(args[0], "-NoExit");
        assert_eq!(args[1], "-Command");
        assert!(args[2].contains("PSConsoleHostReadLine"));
        assert!(args[2].contains("]133;A"));
        assert!(args[2].contains("]133;C"));
        assert!(args[2].contains("]133;D;"));
    }

    #[test]
    fn shell_kind_matches_supported_families() {
        assert_eq!(shell_kind("/bin/zsh"), Some("zsh"));
        assert_eq!(shell_kind("/usr/bin/bash"), Some("bash"));
        assert_eq!(shell_kind("pwsh"), Some("pwsh"));
        assert_eq!(shell_kind("C:\\Program Files\\PowerShell\\7\\pwsh.exe"), Some("pwsh"));
        assert_eq!(shell_kind("powershell.exe"), Some("pwsh"));
        assert_eq!(shell_kind("/usr/bin/fish"), None);
        assert_eq!(shell_kind("nu"), None);
    }

    #[test]
    fn zsh_gets_zdotdir_and_bash_gets_prompt_command() {
        let dir = std::env::temp_dir().join(format!("cw-int-test2-{}", std::process::id()));
        let env = env_for_shell("/bin/zsh", &dir, false).expect("zsh integration");
        assert!(env.iter().any(|(k, _)| k == "ZDOTDIR"));
        assert!(env.iter().any(|(k, _)| k == "CW_ORIG_ZDOTDIR"));

        let env = env_for_shell("/usr/bin/bash", &dir, false).expect("bash integration");
        let prompt_command = env
            .iter()
            .find(|(k, _)| k == "PROMPT_COMMAND")
            .map(|(_, v)| v.as_str())
            .expect("PROMPT_COMMAND set");
        assert!(prompt_command.contains(r"133;D;%d"));
        assert!(prompt_command.contains(r"133;A"));
        assert!(prompt_command.contains("file://"));

        let ps0 = env
            .iter()
            .find(|(k, _)| k == "PS0")
            .map(|(_, v)| v.as_str())
            .expect("PS0 set");
        assert_eq!(ps0, "\x1b]133;C\x07");

        // PowerShell integrates through startup args, not env vars.
        assert!(env_for_shell("pwsh", &dir, true).is_none());
        assert!(env_for_shell("/usr/bin/fish", &dir, true).is_none());
        fs::remove_dir_all(&dir).ok();
    }
}
