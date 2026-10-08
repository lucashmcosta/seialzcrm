import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { EffectiveWidget } from './useOrgWidgets';
import type { WidgetContext } from './types';

interface Props {
  widget: EffectiveWidget | null;
  context: WidgetContext;
  onClose: () => void;
}

export function WidgetHost({ widget, context, onClose }: Props) {
  if (!widget) return null;
  const { def, openMode } = widget;
  const Body = def.Component;

  if (openMode === 'modal') {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-widget-host="modal">
          <DialogHeader>
            <DialogTitle>{def.name}</DialogTitle>
            <DialogDescription>{def.description}</DialogDescription>
          </DialogHeader>
          <Body context={context} />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" data-widget-host="drawer">
        <SheetHeader>
          <SheetTitle>{def.name}</SheetTitle>
          <SheetDescription>{def.description}</SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          <Body context={context} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
