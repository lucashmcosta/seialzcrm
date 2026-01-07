/**
 * AnimatedCard Component
 * Card com efeitos de hover 3D e animações
 */

import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { ReactNode, MouseEvent } from 'react';
import { cn } from '@/lib/utils';
import { transitions } from '@/lib/animations';

interface AnimatedCardProps {
  children: ReactNode;
  className?: string;
  /** Habilita efeito 3D de tilt no hover */
  tilt?: boolean;
  /** Intensidade do tilt (padrão: 10) */
  tiltIntensity?: number;
  /** Habilita efeito de glow no hover */
  glow?: boolean;
  /** Habilita efeito de lift (elevação) no hover */
  lift?: boolean;
  /** Callback de click */
  onClick?: () => void;
  /** Se o card é clicável (adiciona cursor pointer) */
  clickable?: boolean;
}

export function AnimatedCard({
  children,
  className = '',
  tilt = false,
  tiltIntensity = 10,
  glow = false,
  lift = true,
  onClick,
  clickable = false,
}: AnimatedCardProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseXSpring = useSpring(x, { stiffness: 300, damping: 30 });
  const mouseYSpring = useSpring(y, { stiffness: 300, damping: 30 });

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], [tiltIntensity, -tiltIntensity]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], [-tiltIntensity, tiltIntensity]);

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    if (!tilt) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;
    
    x.set(xPct);
    y.set(yPct);
  }

  function handleMouseLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div
      className={cn(
        'relative rounded-xl border border-border bg-card p-6',
        'transition-shadow duration-normal',
        glow && 'hover:shadow-glow',
        (clickable || onClick) && 'cursor-pointer',
        className
      )}
      style={{
        rotateX: tilt ? rotateX : 0,
        rotateY: tilt ? rotateY : 0,
        transformStyle: 'preserve-3d',
      }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={lift ? { y: -4, boxShadow: 'var(--shadow-lg)' } : undefined}
      whileTap={(clickable || onClick) ? { scale: 0.98 } : undefined}
      transition={transitions.spring}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
    >
      <div style={{ transform: 'translateZ(50px)' }}>
        {children}
      </div>
    </motion.div>
  );
}

/**
 * GlassCard
 * Card com efeito glassmorphism
 */
interface GlassCardProps {
  children: ReactNode;
  className?: string;
  blur?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

export function GlassCard({
  children,
  className = '',
  blur = 'md',
  onClick,
}: GlassCardProps) {
  const blurValues = {
    sm: 'backdrop-blur-sm',
    md: 'backdrop-blur-md',
    lg: 'backdrop-blur-lg',
  };

  return (
    <motion.div
      className={cn(
        'relative rounded-xl border p-6',
        'bg-glass-bg border-glass-border',
        blurValues[blur],
        onClick && 'cursor-pointer',
        className
      )}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.01 }}
      whileTap={onClick ? { scale: 0.99 } : undefined}
      transition={transitions.spring}
      onClick={onClick}
    >
      {children}
    </motion.div>
  );
}

/**
 * HoverCard
 * Card simples com hover effect
 */
interface HoverCardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function HoverCard({
  children,
  className = '',
  onClick,
}: HoverCardProps) {
  return (
    <motion.div
      className={cn(
        'rounded-xl border border-border bg-card p-6',
        'transition-all duration-normal',
        onClick && 'cursor-pointer',
        className
      )}
      whileHover={{ 
        y: -2, 
        boxShadow: 'var(--shadow-md)',
        borderColor: 'hsl(var(--primary) / 0.2)',
      }}
      whileTap={onClick ? { scale: 0.99 } : undefined}
      transition={transitions.spring}
      onClick={onClick}
    >
      {children}
    </motion.div>
  );
}
