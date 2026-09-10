//! Shell integration injection.
//!
//! Terminals only learn the shell's working directory when the shell reports
//! it via OSC 7 ("file://host/path"), which stock shells never do. Following
//! the VS Code/WezTerm approach we inject a small integration script:
//!
//! - zsh: point `ZDOTDIR` at a generated directory whose rc files chain to
//!   the user's own config, then add a `precmd` hook that emits OSC 7.
//! - bash: set `PROMPT_COMMAND` in the environment (interactive bash honors
//!   an inherited `PROMPT_COMMAND`).
//!
//! Emission is guarded on `TERM_PROGRAM == "CommandWave"` so nested shells
//! and other terminals are unaffected.

use std::fs;
use std::path::{Path, PathBuf};

use anyhow::Context;

const ZSHRC: &str = r#"# CommandWave shell integration: report cwd (OSC 7) for tab titles.
if [[ $TERM_PROGRAM == "CommandWave" && -z $CW_SHELL_INTEGRATION ]]; then
  export CW_SHELL_INTEGRATION=1
  # ZDOTDIR points at this generated directory; chain to the user's config.
  if [[ -n $CW_ORIG_ZDOTDIR && -r $CW_ORIG_ZDOTDIR/.zshrc ]]; then
    source "$CW_ORIG_ZDOTDIR/.zshrc"
  elif [[ -r $HOME/.zshrc ]]; then
    source "$HOME/.zshrc"
  fi
  __commandwave_osc7() {
    builtin printf '\e]7;file://%s%s\a' "$HOST" "$PWD"
  }
  typeset -ga precmd_functions
  precmd_functions+=(__commandwave_osc7)
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

const BASH_PROMPT_COMMAND: &str = r#"printf '\e]7;file://%s%s\a' "${HOSTNAME%%.*}" "$PWD""#;

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
        "bash" => Some(vec![(
            "PROMPT_COMMAND".to_string(),
            BASH_PROMPT_COMMAND.to_string(),
        )]),
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
        assert!(zshrc.contains("CW_ORIG_ZDOTDIR"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn zsh_gets_zdotdir_and_bash_gets_prompt_command() {
        let dir = std::env::temp_dir().join(format!("cw-int-test2-{}", std::process::id()));
        let env = env_for_shell("/bin/zsh", &dir).expect("zsh integration");
        assert!(env.iter().any(|(k, _)| k == "ZDOTDIR"));
        assert!(env.iter().any(|(k, _)| k == "CW_ORIG_ZDOTDIR"));

        let env = env_for_shell("/usr/bin/bash", &dir).expect("bash integration");
        assert!(env
            .iter()
            .any(|(k, v)| k == "PROMPT_COMMAND" && v.contains("file://")));

        assert!(env_for_shell("/bin/fish", &dir).is_none());
        fs::remove_dir_all(&dir).ok();
    }
}
