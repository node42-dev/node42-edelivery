_n42_edelivery_completions()
{
  local cur prev words cword
  _init_completion || return

  local commands="init send validate replay report convert pki"

  if [[ $cword -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "$commands" -- "$cur") )
    return
  fi

  # send peppol
  if [[ ${words[1]} == "send" && $cword -eq 2 ]]; then
    COMPREPLY=( $(compgen -W "peppol" -- "$cur") )
    return
  fi

  # validate peppol
  if [[ ${words[1]} == "validate" && $cword -eq 2 ]]; then
    COMPREPLY=( $(compgen -W "peppol" -- "$cur") )
    return
  fi
  
  # report peppol
  if [[ ${words[1]} == "report" && $cword -eq 2 ]]; then
    COMPREPLY=( $(compgen -W "peppol" -- "$cur") )
    return
  fi

  # convert sch
  if [[ ${words[1]} == "convert" && $cword -eq 2 ]]; then
    COMPREPLY=( $(compgen -W "sch" -- "$cur") )
    return
  fi
}

complete -F _n42_edelivery_completions n42-edelivery