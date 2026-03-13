interface SeialzLogoProps {
  size?: 'xl' | 'lg' | 'md' | 'sm';
  theme?: 'dark' | 'light' | 'green' | 'white';
  animated?: boolean;
}

export function SeialzLogo({ size = 'md', theme = 'dark', animated = true }: SeialzLogoProps) {
  const classes = [
    'seialz-logo',
    `logo-${size}`,
    `logo-${theme}`,
    !animated && 'logo-static',
  ].filter(Boolean).join(' ');

  return (
    <span className={classes}>
      <span className="br">[</span>
      seialz
      <span className="cur">|</span>
      <span className="br"> ]</span>
    </span>
  );
}
