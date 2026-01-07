/**
 * AnimatedCounter Component
 * Contador animado para números (métricas, valores, etc.)
 */

import { useEffect, useRef } from 'react';
import { motion, useSpring, useTransform, useInView, MotionValue } from 'framer-motion';

interface AnimatedCounterProps {
  /** Valor final do contador */
  value: number;
  /** Duração da animação em segundos */
  duration?: number;
  /** Formatador opcional (ex: formatCurrency) */
  formatter?: (value: number) => string;
  /** Classe CSS adicional */
  className?: string;
  /** Prefixo (ex: "R$") */
  prefix?: string;
  /** Sufixo (ex: "%") */
  suffix?: string;
  /** Decimais a mostrar */
  decimals?: number;
  /** Animar apenas quando visível */
  animateOnView?: boolean;
}

function AnimatedNumber({ 
  motionValue, 
  formatter,
  prefix = '',
  suffix = '',
  decimals = 0,
}: { 
  motionValue: MotionValue<number>;
  formatter?: (value: number) => string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const rounded = useTransform(motionValue, (latest) => {
    if (formatter) {
      return formatter(latest);
    }
    const value = decimals > 0 ? latest.toFixed(decimals) : Math.round(latest);
    return `${prefix}${value}${suffix}`;
  });

  return <motion.span>{rounded}</motion.span>;
}

export function AnimatedCounter({
  value,
  duration = 1.5,
  formatter,
  className = '',
  prefix = '',
  suffix = '',
  decimals = 0,
  animateOnView = true,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });
  
  const spring = useSpring(0, {
    duration: duration * 1000,
    bounce: 0,
  });

  useEffect(() => {
    if (animateOnView) {
      if (isInView) {
        spring.set(value);
      }
    } else {
      spring.set(value);
    }
  }, [spring, value, isInView, animateOnView]);

  return (
    <span ref={ref} className={className}>
      <AnimatedNumber 
        motionValue={spring} 
        formatter={formatter}
        prefix={prefix}
        suffix={suffix}
        decimals={decimals}
      />
    </span>
  );
}

/**
 * AnimatedPercentage
 * Variante otimizada para percentuais
 */
interface AnimatedPercentageProps {
  value: number;
  duration?: number;
  className?: string;
  decimals?: number;
}

export function AnimatedPercentage({
  value,
  duration = 1.5,
  className = '',
  decimals = 0,
}: AnimatedPercentageProps) {
  return (
    <AnimatedCounter
      value={value}
      duration={duration}
      className={className}
      suffix="%"
      decimals={decimals}
    />
  );
}

/**
 * AnimatedCurrency
 * Variante otimizada para valores monetários
 */
interface AnimatedCurrencyProps {
  value: number;
  duration?: number;
  className?: string;
  currency?: string;
  locale?: string;
}

export function AnimatedCurrency({
  value,
  duration = 1.5,
  className = '',
  currency = 'BRL',
  locale = 'pt-BR',
}: AnimatedCurrencyProps) {
  const formatter = (val: number) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <AnimatedCounter
      value={value}
      duration={duration}
      className={className}
      formatter={formatter}
    />
  );
}
