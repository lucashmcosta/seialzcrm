import { Button } from '@/components/ui/button';

interface DialPadProps {
  onPress: (digit: string) => void;
  disabled?: boolean;
}

const DIAL_KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
];

const SUB_LABELS: Record<string, string> = {
  '2': 'ABC',
  '3': 'DEF',
  '4': 'GHI',
  '5': 'JKL',
  '6': 'MNO',
  '7': 'PQRS',
  '8': 'TUV',
  '9': 'WXYZ',
  '0': '+',
};

export function DialPad({ onPress, disabled = false }: DialPadProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {DIAL_KEYS.flat().map((key) => (
        <Button
          key={key}
          variant="outline"
          className="h-14 w-14 flex flex-col items-center justify-center text-lg font-semibold"
          onClick={() => onPress(key)}
          disabled={disabled}
        >
          <span>{key}</span>
          {SUB_LABELS[key] && (
            <span className="text-[10px] text-muted-foreground font-normal">
              {SUB_LABELS[key]}
            </span>
          )}
        </Button>
      ))}
    </div>
  );
}
