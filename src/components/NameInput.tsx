import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation, Locale } from '@/lib/i18n';

interface NameInputProps {
  locale: Locale;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  onFullNameChange?: (value: string) => void;
  onFirstNameChange?: (value: string) => void;
  onLastNameChange?: (value: string) => void;
  required?: boolean;
}

export function NameInput({
  locale,
  fullName = '',
  firstName = '',
  lastName = '',
  onFullNameChange,
  onFirstNameChange,
  onLastNameChange,
  required = false,
}: NameInputProps) {
  const { t } = useTranslation(locale);

  if (locale === 'pt-BR') {
    return (
      <div className="space-y-2">
        <Label htmlFor="fullName">{t('auth.fullName')}</Label>
        <Input
          id="fullName"
          type="text"
          value={fullName}
          onChange={(e) => onFullNameChange?.(e.target.value)}
          required={required}
          placeholder={t('auth.fullName')}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label htmlFor="firstName">{t('auth.firstName')}</Label>
        <Input
          id="firstName"
          type="text"
          value={firstName}
          onChange={(e) => onFirstNameChange?.(e.target.value)}
          required={required}
          placeholder={t('auth.firstName')}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="lastName">{t('auth.lastName')}</Label>
        <Input
          id="lastName"
          type="text"
          value={lastName}
          onChange={(e) => onLastNameChange?.(e.target.value)}
          required={required}
          placeholder={t('auth.lastName')}
        />
      </div>
    </div>
  );
}