# Source this from an interactive zsh session to enable Ultron Rich Output.
autoload -Uz add-zsh-hook

_ultron_rich_preexec() {
  emulate -L zsh
  local MATCH MBEGIN MEND
  local -a match mbegin mend
  local logs_pattern='^docker logs (--tail [0-9]{1,9} )?(--timestamps )?[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$'
  local git_log_pattern='^git (--no-pager )?log( -n [1-9][0-9]{0,3})?$'
  typeset -g _ultron_rich_active=''
  case "$1" in
    ('docker ps'|'docker ps -a'|'docker images'|'docker compose ps'|'df'|'df -h'|'git status')
      _ultron_rich_active="$1"
      ;;
    ('git log'|'git log '*|'git --no-pager log'|'git --no-pager log '*)
      if [[ "$1" =~ $git_log_pattern ]]; then
        _ultron_rich_active="$1"
      fi
      ;;
    ('docker logs '*)
      if [[ "$1" =~ $logs_pattern ]]; then
        _ultron_rich_active="$1"
      fi
      ;;
  esac
  if [[ -n $_ultron_rich_active ]]; then
    builtin printf '\033]6973;%s\007' "$_ultron_rich_active"
  fi
  return 0
}

_ultron_rich_precmd() {
  local status_code=$?
  if [[ -n ${_ultron_rich_active-} ]]; then
    _ultron_rich_active=''
    builtin printf '\033]6973;exit=%d\007' "$status_code"
  fi
  return 0
}

# Capture the command status before other prompt hooks run.
typeset -ga precmd_functions
add-zsh-hook -d precmd _ultron_rich_precmd
precmd_functions=(_ultron_rich_precmd "${precmd_functions[@]}")
add-zsh-hook preexec _ultron_rich_preexec
