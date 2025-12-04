import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { detectCountryFromE164, formatPhoneForCountry, buildE164, COUNTRIES } from "@/lib/phoneUtils";

interface PhoneInputProps {
  value: string;
  onChange: (e164Value: string) => void;
  defaultCountry?: string;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
}

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value, onChange, defaultCountry = "BR", placeholder, className, id, disabled }, ref) => {
    const [country, setCountry] = React.useState(() => {
      if (value) {
        return detectCountryFromE164(value);
      }
      return defaultCountry;
    });
    
    const [localValue, setLocalValue] = React.useState(() => {
      if (value) {
        return formatPhoneForCountry(value, detectCountryFromE164(value));
      }
      return "";
    });

    // Update local state when value prop changes
    React.useEffect(() => {
      if (value) {
        const detectedCountry = detectCountryFromE164(value);
        setCountry(detectedCountry);
        setLocalValue(formatPhoneForCountry(value, detectedCountry));
      } else {
        setLocalValue("");
      }
    }, [value]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value;
      
      // Allow only numbers and formatting characters
      const cleaned = inputValue.replace(/[^\d\s\-()]/g, "");
      setLocalValue(cleaned);
      
      // Build E.164 and emit
      const e164 = buildE164(cleaned, country);
      onChange(e164);
    };

    const handleCountryChange = (newCountry: string) => {
      setCountry(newCountry);
      
      // Rebuild E.164 with new country code
      if (localValue) {
        const e164 = buildE164(localValue, newCountry);
        onChange(e164);
      }
    };

    const handleBlur = () => {
      // Format the number on blur
      if (localValue) {
        const e164 = buildE164(localValue, country);
        setLocalValue(formatPhoneForCountry(e164, country));
      }
    };

    const selectedCountry = COUNTRIES.find(c => c.code === country) || COUNTRIES[0];

    return (
      <div className={cn("flex", className)}>
        <Select value={country} onValueChange={handleCountryChange} disabled={disabled}>
          <SelectTrigger className="w-[120px] rounded-r-none border-r-0 flex-shrink-0">
            <SelectValue>
              <span className="flex items-center gap-1.5">
                <span>{selectedCountry.flag}</span>
                <span className="text-muted-foreground">+{selectedCountry.dialCode}</span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                <span className="flex items-center gap-2">
                  <span>{c.flag}</span>
                  <span>+{c.dialCode}</span>
                  <span className="text-muted-foreground">{c.name}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          ref={ref}
          id={id}
          type="tel"
          value={localValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          placeholder={placeholder || selectedCountry.placeholder}
          className="rounded-l-none flex-1"
          disabled={disabled}
        />
      </div>
    );
  }
);

PhoneInput.displayName = "PhoneInput";

export { PhoneInput };
