/**
 * PageTransition Component
 * Wrapper para adicionar animações de transição em páginas
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { pageTransition, transitions } from '@/lib/animations';
import { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
  /** Variant para usar: 'fade', 'slide', 'scale' */
  variant?: 'fade' | 'slide' | 'scale';
}

const variants = {
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  slide: {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  },
  scale: {
    initial: { opacity: 0, scale: 0.98 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.98 },
  },
};

export function PageTransition({ 
  children, 
  className = '',
  variant = 'fade' 
}: PageTransitionProps) {
  const location = useLocation();
  
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={variants[variant]}
        transition={transitions.ease}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * StaggerContainer
 * Container para animar filhos com efeito stagger
 */
interface StaggerContainerProps {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
  /** Delay inicial antes de começar o stagger */
  initialDelay?: number;
}

export function StaggerContainer({ 
  children, 
  className = '',
  staggerDelay = 0.05,
  initialDelay = 0.1
}: StaggerContainerProps) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={{
        initial: {},
        animate: {
          transition: {
            staggerChildren: staggerDelay,
            delayChildren: initialDelay,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * StaggerItem
 * Item individual dentro de um StaggerContainer
 */
interface StaggerItemProps {
  children: ReactNode;
  className?: string;
}

export function StaggerItem({ children, className = '' }: StaggerItemProps) {
  return (
    <motion.div
      variants={{
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
      }}
      transition={transitions.spring}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * FadeIn
 * Componente simples de fade in
 */
interface FadeInProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
}

export function FadeIn({ 
  children, 
  className = '',
  delay = 0,
  direction = 'up'
}: FadeInProps) {
  const directionOffset = {
    up: { y: 20 },
    down: { y: -20 },
    left: { x: 20 },
    right: { x: -20 },
    none: {},
  };

  return (
    <motion.div
      initial={{ opacity: 0, ...directionOffset[direction] }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ ...transitions.ease, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * ScaleIn
 * Componente de scale in com opção de hover
 */
interface ScaleInProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  hover?: boolean;
}

export function ScaleIn({ 
  children, 
  className = '',
  delay = 0,
  hover = false
}: ScaleInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={hover ? { scale: 1.02 } : undefined}
      whileTap={hover ? { scale: 0.98 } : undefined}
      transition={{ ...transitions.spring, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
