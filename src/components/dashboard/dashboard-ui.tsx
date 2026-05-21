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
  <div
    className={`mb-5 flex flex-col gap-3 overflow-x-clip px-1 md:flex-row md:items-center md:justify-between ${className}`}
  >
    <h2 className="cs-view-section-title min-w-0 max-md:w-full">
      {showDot && <LiveDot colorClass={dotColorClass} />}
      {title}
    </h2>
    {children ? (
      <div className="flex min-w-0 max-md:w-full items-center justify-start md:shrink-0 md:justify-end">
        {children}
      </div>
    ) : null}
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
