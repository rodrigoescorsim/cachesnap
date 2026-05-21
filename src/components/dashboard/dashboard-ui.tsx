import React from 'react'

/**
 * Padrão de ponto pulsante discreto usado em cabeçalhos e indicadores de "Live".
 */
export const LiveDot = ({ colorClass = 'bg-emerald-500' }: { colorClass?: string }) => (
  <span className={`h-1.5 w-1.5 rounded-full shrink-0 max-md:animate-none md:animate-pulse ${colorClass}`} />
)

interface ViewSectionHeaderProps {
  title: React.ReactNode
  showDot?: boolean
  dotColorClass?: string
  className?: string
  children?: React.ReactNode
}

/**
 * Cabeçalho de seção padronizado para as abas do Monitor.
 * Inclui o LiveDot opcional e mantém a altura fixa (h-9) para evitar saltos.
 */
export const ViewSectionHeader = ({ title, showDot = true, dotColorClass, className = '', children }: ViewSectionHeaderProps) => (
  <div className={`flex items-center justify-between gap-3 mb-5 px-1 ${className}`}>
    <h2 className="cs-view-section-title">
      {showDot && <LiveDot colorClass={dotColorClass} />}
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
