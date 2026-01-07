/**
 * Framer Motion Animation Variants
 * Design System: Untitled UI PRO Style
 * 
 * Estas variantes são reutilizáveis em todo o projeto para manter
 * consistência nas animações.
 */

import { Variants, Transition } from 'framer-motion';

// ============= TRANSITIONS =============

export const transitions = {
  // Suave e natural
  spring: {
    type: 'spring',
    stiffness: 300,
    damping: 30,
  } as Transition,
  
  // Spring mais suave para elementos maiores
  springGentle: {
    type: 'spring',
    stiffness: 200,
    damping: 25,
  } as Transition,
  
  // Spring rápido para micro-interações
  springSnappy: {
    type: 'spring',
    stiffness: 500,
    damping: 30,
  } as Transition,
  
  // Ease para transições simples
  ease: {
    type: 'tween',
    ease: [0.25, 0.1, 0.25, 1],
    duration: 0.3,
  } as Transition,
  
  // Ease rápido
  easeFast: {
    type: 'tween',
    ease: [0.25, 0.1, 0.25, 1],
    duration: 0.15,
  } as Transition,
  
  // Ease lento para elementos grandes
  easeSlow: {
    type: 'tween',
    ease: [0.25, 0.1, 0.25, 1],
    duration: 0.5,
  } as Transition,
};

// ============= FADE VARIANTS =============

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 20 },
};

export const fadeInDown: Variants = {
  initial: { opacity: 0, y: -20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

export const fadeInLeft: Variants = {
  initial: { opacity: 0, x: -20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

export const fadeInRight: Variants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 20 },
};

// ============= SCALE VARIANTS =============

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
};

export const scaleInCenter: Variants = {
  initial: { opacity: 0, scale: 0.8 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.8 },
};

export const popIn: Variants = {
  initial: { opacity: 0, scale: 0.5 },
  animate: { 
    opacity: 1, 
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 25,
    },
  },
  exit: { opacity: 0, scale: 0.5 },
};

// ============= SLIDE VARIANTS =============

export const slideInRight: Variants = {
  initial: { x: '100%' },
  animate: { x: 0 },
  exit: { x: '100%' },
};

export const slideInLeft: Variants = {
  initial: { x: '-100%' },
  animate: { x: 0 },
  exit: { x: '-100%' },
};

export const slideInUp: Variants = {
  initial: { y: '100%' },
  animate: { y: 0 },
  exit: { y: '100%' },
};

export const slideInDown: Variants = {
  initial: { y: '-100%' },
  animate: { y: 0 },
  exit: { y: '-100%' },
};

// ============= STAGGER VARIANTS =============

export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

export const staggerContainerFast: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.03,
      delayChildren: 0.05,
    },
  },
};

export const staggerContainerSlow: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
};

export const staggerItemScale: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
};

// ============= PAGE TRANSITION VARIANTS =============

export const pageTransition: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.25, 0.1, 0.25, 1],
    },
  },
  exit: { 
    opacity: 0, 
    y: -20,
    transition: {
      duration: 0.3,
      ease: [0.25, 0.1, 0.25, 1],
    },
  },
};

export const pageSlide: Variants = {
  initial: { opacity: 0, x: 20 },
  animate: { 
    opacity: 1, 
    x: 0,
    transition: {
      duration: 0.4,
      ease: [0.25, 0.1, 0.25, 1],
    },
  },
  exit: { 
    opacity: 0, 
    x: -20,
    transition: {
      duration: 0.3,
      ease: [0.25, 0.1, 0.25, 1],
    },
  },
};

// ============= MODAL/DIALOG VARIANTS =============

export const modalBackdrop: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const modalContent: Variants = {
  initial: { opacity: 0, scale: 0.95, y: 10 },
  animate: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 30,
    },
  },
  exit: { 
    opacity: 0, 
    scale: 0.95, 
    y: 10,
    transition: {
      duration: 0.2,
    },
  },
};

export const drawer: Variants = {
  initial: { x: '100%' },
  animate: { 
    x: 0,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 30,
    },
  },
  exit: { 
    x: '100%',
    transition: {
      duration: 0.2,
    },
  },
};

// ============= DROPDOWN/POPOVER VARIANTS =============

export const dropdownMenu: Variants = {
  initial: { opacity: 0, scale: 0.95, y: -5 },
  animate: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 30,
    },
  },
  exit: { 
    opacity: 0, 
    scale: 0.95, 
    y: -5,
    transition: {
      duration: 0.15,
    },
  },
};

export const tooltip: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { 
    opacity: 1, 
    scale: 1,
    transition: {
      duration: 0.15,
    },
  },
  exit: { 
    opacity: 0, 
    scale: 0.95,
    transition: {
      duration: 0.1,
    },
  },
};

// ============= CARD VARIANTS =============

export const cardHover = {
  rest: { 
    scale: 1,
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
  },
  hover: { 
    scale: 1.02,
    boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.15)',
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 30,
    },
  },
  tap: { 
    scale: 0.98,
  },
};

export const card3D = {
  rest: {
    rotateX: 0,
    rotateY: 0,
    scale: 1,
  },
  hover: {
    scale: 1.02,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 30,
    },
  },
};

// ============= BUTTON VARIANTS =============

export const buttonPress: Variants = {
  rest: { scale: 1 },
  pressed: { scale: 0.97 },
  hover: { scale: 1.02 },
};

export const buttonGlow = {
  rest: {
    boxShadow: '0 0 0 0 rgba(var(--primary), 0)',
  },
  hover: {
    boxShadow: '0 0 20px 2px hsl(var(--primary) / 0.3)',
    transition: {
      duration: 0.3,
    },
  },
};

// ============= LIST/TABLE VARIANTS =============

export const listItem: Variants = {
  initial: { opacity: 0, x: -10 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 10 },
};

export const tableRow: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

export const rowHover = {
  rest: { 
    backgroundColor: 'transparent',
  },
  hover: { 
    backgroundColor: 'hsl(var(--muted) / 0.5)',
    transition: {
      duration: 0.2,
    },
  },
};

// ============= ACCORDION VARIANTS =============

export const accordionContent: Variants = {
  initial: { height: 0, opacity: 0 },
  animate: { 
    height: 'auto', 
    opacity: 1,
    transition: {
      height: {
        type: 'spring',
        stiffness: 300,
        damping: 30,
      },
      opacity: {
        duration: 0.2,
        delay: 0.1,
      },
    },
  },
  exit: { 
    height: 0, 
    opacity: 0,
    transition: {
      height: {
        type: 'spring',
        stiffness: 300,
        damping: 30,
      },
      opacity: {
        duration: 0.1,
      },
    },
  },
};

// ============= SIDEBAR VARIANTS =============

export const sidebarExpand: Variants = {
  collapsed: { width: 64 },
  expanded: { 
    width: 256,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 30,
    },
  },
};

export const sidebarItemText: Variants = {
  collapsed: { opacity: 0, width: 0 },
  expanded: { 
    opacity: 1, 
    width: 'auto',
    transition: {
      opacity: { delay: 0.1, duration: 0.2 },
    },
  },
};

// ============= NOTIFICATION/TOAST VARIANTS =============

export const toastSlide: Variants = {
  initial: { opacity: 0, x: 100, scale: 0.95 },
  animate: { 
    opacity: 1, 
    x: 0, 
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 30,
    },
  },
  exit: { 
    opacity: 0, 
    x: 100, 
    scale: 0.95,
    transition: {
      duration: 0.2,
    },
  },
};

// ============= SKELETON/LOADING VARIANTS =============

export const shimmer: Variants = {
  initial: { x: '-100%' },
  animate: { 
    x: '100%',
    transition: {
      repeat: Infinity,
      duration: 1.5,
      ease: 'linear',
    },
  },
};

export const pulse: Variants = {
  initial: { opacity: 0.5 },
  animate: { 
    opacity: 1,
    transition: {
      repeat: Infinity,
      repeatType: 'reverse',
      duration: 1,
    },
  },
};

// ============= NUMBER COUNTER =============

export const counterConfig = {
  duration: 1.5,
  ease: [0.25, 0.1, 0.25, 1] as const,
};

// ============= DRAG VARIANTS (for Kanban) =============

export const draggableCard = {
  rest: { 
    scale: 1,
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    zIndex: 0,
  },
  dragging: { 
    scale: 1.05,
    boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.2)',
    zIndex: 50,
    cursor: 'grabbing',
  },
};

// ============= CHECK/SUCCESS VARIANTS =============

export const checkmark: Variants = {
  initial: { pathLength: 0, opacity: 0 },
  animate: { 
    pathLength: 1, 
    opacity: 1,
    transition: {
      pathLength: {
        type: 'spring',
        stiffness: 400,
        damping: 30,
      },
      opacity: { duration: 0.1 },
    },
  },
};

export const confetti = {
  initial: { scale: 0, opacity: 1 },
  animate: { 
    scale: 1, 
    opacity: 0,
    transition: {
      scale: { type: 'spring', stiffness: 300, damping: 20 },
      opacity: { delay: 0.3, duration: 0.5 },
    },
  },
};
