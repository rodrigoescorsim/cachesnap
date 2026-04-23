import type { InputHTMLAttributes } from 'react'

export type CsCheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Alinha ao topo quando o rótulo ao lado tem várias linhas de texto */
  align?: 'start' | 'none'
}

/**
 * Checkbox do design system (`.cs-checkbox` em `globals.css`).
 * Evita duplicar classes Tailwind + ícone inline em formulários.
 */
export function CsCheckbox({ className = '', align = 'none', ...props }: CsCheckboxProps) {
  const alignCls = align === 'start' ? 'cs-checkbox--align-start' : ''
  const extra = className.trim()
  return (
    <input
      type="checkbox"
      className={['cs-checkbox', alignCls, extra].filter(Boolean).join(' ')}
      {...props}
    />
  )
}
