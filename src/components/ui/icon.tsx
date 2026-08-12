import React from 'react'
import * as LucideIcons from 'lucide-react'
import type { LucideProps } from 'lucide-react'

interface IconProps extends LucideProps { name: string; fallback?: string }
const Icon: React.FC<IconProps> = ({ name, fallback = 'CircleAlert', ...props }) => {
  const icons = LucideIcons as unknown as Record<string, React.FC<LucideProps>>
  const IconComponent = icons[name]
  if (!IconComponent) {
    const FallbackIcon = icons[fallback]
    return FallbackIcon ? <FallbackIcon {...props} /> : <span className="text-xs text-gray-400">[icon]</span>
  }
  return <IconComponent {...props} />
}
export default Icon
