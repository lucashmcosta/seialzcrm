import { cn } from "@/lib/utils";
import {
  Avatar as ShadcnAvatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";

interface AvatarProps {
  src?: string | null;
  alt?: string;
  fallbackText?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeClasses = {
  xs: "h-6 w-6 text-xs",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-lg",
};

export const Avatar = ({
  src,
  alt,
  fallbackText,
  size = "md",
  className,
}: AvatarProps) => {
  const initials = fallbackText
    ? fallbackText
        .split(" ")
        .map((word) => word[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";

  return (
    <ShadcnAvatar className={cn(sizeClasses[size], className)}>
      {src && <AvatarImage src={src} alt={alt || fallbackText || ""} />}
      <AvatarFallback className="bg-primary/10 text-primary font-medium">
        {initials}
      </AvatarFallback>
    </ShadcnAvatar>
  );
};
