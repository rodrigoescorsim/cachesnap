import React from 'react'

/**
 * Padrão de ponto pulsante discreto usado em cabeçalhos e indicadores de "Live".
 */
export const LiveDot = () => (
  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
)

interface ViewSectionHeaderProps {
  title: React.ReactNode
  showDot?: boolean
  className?: string
  children?: React.ReactNode
}

/**
 * Cabeçalho de seção padronizado para as abas do Monitor.
 * Inclui o LiveDot opcional e mantém a altura fixa (h-9) para evitar saltos.
 */
export const ViewSectionHeader = ({ title, showDot = true, className = '', children }: ViewSectionHeaderProps) => (
  <div className={`flex h-9 items-center justify-between gap-3 mb-3 ${className}`}>
    <h2 className="cs-view-section-title">
      {showDot && <LiveDot />}
      {title}
    </h2>
    {children}
  </div>
)

interface ViewSectionProps {
  children: React.ReactNode
  className?: string
}

/**
 * Container de seção padronizado que mantém o espaçamento vertical entre elementos (space-y-4).
 */
export const ViewSection = ({ children, className = '' }: ViewSectionProps) => (
  <section className={`space-y-4 ${className}`}>
    {children}
  </section>
)
