//! Shell integration injection.
//!
//! Terminals only learn the shell's working directory when the shell reports
//! it via OSC 7 ("file://host/path"), and only learn command boundaries when
//! the shell reports them via OSC 133 (FinalTerm-style prompt marks: A =
//! prompt start, C = command executing, D;exit = command finished). Stock
//! shells emit neither, so following the VS Code/WezTerm approach we inject a
//! small integration script:
//!
//! - zsh: point `ZDOTDIR` at a generated directory whose rc files chain to
//!   the user's own config, then add `precmd`/`preexec` hooks that emit
//!   OSC 7 + OSC 133.
//! - bash: `PROMPT_COMMAND` and `PS0` are set in the environment
//!   (interactive bash honors inherited values).
//!
//! Emission is guarded on `TERM_PROGRAM == "CommandWave"` so nested shells
//! and other terminals are unaffected.

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
    builtin printf '\e]133;D;%d\a' "$__cw_exit"
    builtin printf '\e]133;A\a'
    builtin printf '\e]7;file://%s%s\a' "$HOST" "$PWD"
  }
  # Optional starship prompt (app setting; idempotent across nested shells).
  if [[ $CW_USE_STARSHIP == 1 && -z $CW_STARSHIP_INITED ]] && command -v starship >/dev/null 2>&1; then
    export CW_STARSHIP_INITED=1
    eval "$(starship init zsh)"
  fi
  __commandwave_preexec() {
    builtin printf '\e]133;C\a'
  }
  typeset -ga precmd_functions
  precmd_functions+=(__commandwave_precmd)
  typeset -ga preexec_functions
  preexec_functions+=(__commandwave_preexec)
fi
"#;

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

/// bash: the plain OSC 133/7 printf chain that follows the starship guard
/// is inlined at the end of BASH_PROMPT_COMMAND_STARSHIP (below).

/// bash: PS0's value is *printed* (prompt-expanded, not executed) after a
/// command line is read but before it runs — so embed the escape bytes
/// directly instead of going through printf.
const BASH_PS0: &str = "\x1b]133;C\x07";

/// bash + starship: the first prompt lazily evals `starship init bash`
/// (which replaces PROMPT_COMMAND with its own hook), then re-chains our
/// OSC 133/7 emission around starship's hook so prompt marks and cwd
/// tracking survive the takeover. The command's exit status is captured
/// before starship's hook runs. When CW_USE_STARSHIP is unset the guard
/// falls straight through to the plain integration below.
const BASH_PROMPT_COMMAND_STARSHIP: &str = "__CW_E=$?; if [[ $CW_USE_STARSHIP == 1 && -z $CW_STARSHIP_INITED ]] && command -v starship >/dev/null 2>&1; then CW_STARSHIP_INITED=1; eval \"$(starship init bash)\"; __CW_SP=\"$PROMPT_COMMAND\"; PROMPT_COMMAND='__CW_E=$?; eval \"$__CW_SP\"; printf '\\''\\e]133;D;%d\\a'\\'' \"$__CW_E\"; printf '\\''\\e]133;A\\a'\\''; printf '\\''\\e]7;file://%s%s\\a'\\'' \"${HOSTNAME%%.*}\" \"$PWD\"'; fi; printf '\\e]133;D;%d\\a' \"$__CW_E\"; printf '\\e]133;A\\a'; printf '\\e]7;file://%s%s\\a' \"${HOSTNAME%%.*}\" \"$PWD\"";

/// PowerShell + starship: pwsh starts with these arguments so the init runs
/// after the user's profile, without touching $PROFILE.
pub fn powershell_starship_args() -> Vec<String> {
    vec![
        "-NoExit".to_string(),
        "-Command".to_string(),
        "if ($env:CW_USE_STARSHIP -eq '1') { Invoke-Expression (&starship init powershell) }"
            .to_string(),
    ]
}

/// Write the integration files under `<base>/shell-integration/` and return
/// the ZDOTDIR that should be set for zsh. Idempotent; rewritten on each call
/// so updates ship with the app.
pub fn write_integration_files(base: &Path) -> Result<PathBuf, anyhow::Error> {
    let zdotdir = base.join("shell-integration").join("zsh");
    fs::create_dir_all(&zdotdir).context("creating shell integration dir")?;
    fs::write(zdotdir.join(".zshrc"), ZSHRC)?;
    fs::write(zdotdir.join(".zshenv"), zsh_passthrough!(".zshenv"))?;
    fs::write(zdotdir.join(".zprofile"), zsh_passthrough!(".zprofile"))?;
    fs::write(zdotdir.join(".zlogin"), zsh_passthrough!(".zlogin"))?;
    Ok(zdotdir)
}

/// Prepare environment for the given shell program. Returns the env vars to
/// set (`None` when the shell needs no / unsupported integration).
pub fn env_for_shell(program: &str, base: &Path) -> Option<Vec<(String, String)>> {
    let program = program.rsplit(['/', '\\']).next().unwrap_or(program);
    match program {
        "zsh" => {
            let zdotdir = write_integration_files(base).ok()?;
            let orig = std::env::var("ZDOTDIR").unwrap_or_default();
            Some(vec![
                ("ZDOTDIR".to_string(), zdotdir.to_string_lossy().into_owned()),
                ("CW_ORIG_ZDOTDIR".to_string(), orig),
            ])
        }
        "bash" => Some(vec![
            (
                "PROMPT_COMMAND".to_string(),
                BASH_PROMPT_COMMAND_STARSHIP.to_string(),
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
        let zdotdir = write_integration_files(&dir).expect("write integration files");
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
        let zdotdir = write_integration_files(&dir).expect("write integration files");
        let zshrc = fs::read_to_string(zdotdir.join(".zshrc")).unwrap();
        // precmd: previous command finish (D with $?), then prompt start (A), then cwd.
        assert!(zshrc.contains(r"133;D;%d"));
        assert!(zshrc.contains(r"133;A"));
        assert!(zshrc.contains(r"133;C"));
        assert!(zshrc.contains(r"]7;file://%s%s"));
        // $? is captured as the first statement of the hook.
        assert!(zshrc.contains("local __cw_exit=$?"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn bash_prompt_command_chains_starship() {
        let cmd = BASH_PROMPT_COMMAND_STARSHIP;
        // Lazy one-time init gated on the starship flag.
        assert!(cmd.contains("CW_USE_STARSHIP == 1"));
        assert!(cmd.contains("starship init bash"));
        // starship's PROMPT_COMMAND takeover is re-chained with our OSC
        // emission, exit status captured before the starship hook runs.
        assert!(cmd.contains("__CW_E=$?"));
        assert!(cmd.contains("eval \"$__CW_SP\""));
        // Falls through to the plain integration when disabled.
        assert!(cmd.contains(r"133;D;%d"));
        assert!(cmd.contains(r"]7;file://%s%s"));
    }

    #[test]
    fn powershell_starship_args_init_after_profile() {
        let args = powershell_starship_args();
        assert_eq!(args[0], "-NoExit");
        assert_eq!(args[1], "-Command");
        assert!(args[2].contains("starship init powershell"));
        assert!(args[2].contains("$env:CW_USE_STARSHIP"));
    }

    #[test]
    fn zsh_gets_zdotdir_and_bash_gets_prompt_command() {
        let dir = std::env::temp_dir().join(format!("cw-int-test2-{}", std::process::id()));
        let env = env_for_shell("/bin/zsh", &dir).expect("zsh integration");
        assert!(env.iter().any(|(k, _)| k == "ZDOTDIR"));
        assert!(env.iter().any(|(k, _)| k == "CW_ORIG_ZDOTDIR"));

        let env = env_for_shell("/usr/bin/bash", &dir).expect("bash integration");
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

        assert!(env_for_shell("/bin/fish", &dir).is_none());
        fs::remove_dir_all(&dir).ok();
    }
}
