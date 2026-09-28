import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowSquareOut, Phone, ArrowBendUpLeft, Image as ImageIcon } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationContext } from '@/contexts/OrganizationContext';
import { templateDisplay, type TemplateDisplay } from '../../../supabase/functions/_shared/template-display';

type Parameter = { type?: string; text?: string; image?: { link?: string } };
export type StoredTemplate = {
  template_id?: string;
  components?: Array<{ type?: string; parameters?: Parameter[] }>;
  display?: TemplateDisplay;
};

// React text nodes keep template text literal and cannot execute embedded HTML.
export function TemplateText({ text }: { text: string }) {
  return <>{text.split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|```[^`]+```)/g).map((part, i) => {
    if (part.startsWith('```') && part.endsWith('```')) return <code key={i}>{part.slice(3, -3)}</code>;
    if (part.startsWith('*') && part.endsWith('*')) return <strong key={i}>{part.slice(1, -1)}</strong>;
    if (part.startsWith('_') && part.endsWith('_')) return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith('~') && part.endsWith('~')) return <del key={i}>{part.slice(1, -1)}</del>;
    return <Fragment key={i}>{part}</Fragment>;
  })}</>;
}

export function TemplateMessageCard({ template, content }: { template: StoredTemplate; content: string }) {
  const { organization } = useOrganizationContext();
  const { data } = useQuery({
    queryKey: ['message-template-display', organization?.id, template.template_id],
    enabled: !template.display && !!organization?.id && !!template.template_id,
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('whatsapp_templates').select('components')
        .eq('organization_id', organization!.id).eq('id', template.template_id!).maybeSingle();
      if (error) throw error;
      return templateDisplay(data?.components);
    },
  });
  return <TemplateCardContent template={template} content={content} display={template.display || data} />;
}

export function TemplateCardContent({ template, content, display }: { template: StoredTemplate; content: string; display?: TemplateDisplay }) {
  const header = template.components?.find(c => c.type?.toLowerCase() === 'header');
  const rawImage = header?.parameters?.find(p => p.type === 'image')?.image?.link;
  const image = rawImage && /^https:\/\//i.test(rawImage) ? rawImage : undefined;
  const headerText = header?.parameters?.filter(p => p.type === 'text').map(p => p.text).join(' ') || display?.headerText;
  const [failedImage, setFailedImage] = useState<string>();
  return (
    <div className="w-[300px] max-w-full overflow-hidden rounded-lg" aria-label="Prévia do template enviado">
      {image && (failedImage === image ? (
        <div className="flex h-32 items-center justify-center gap-2 rounded-md bg-black/5 text-xs"><ImageIcon size={18} />Imagem indisponível</div>
      ) : <img src={image} alt="Imagem do template" loading="lazy" referrerPolicy="no-referrer" className="max-h-72 w-full rounded-md object-contain" onError={() => setFailedImage(image)} />)}
      <div className="space-y-1 py-2 text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
        {headerText && <div className="font-semibold"><TemplateText text={headerText} /></div>}
        <div><TemplateText text={content} /></div>
        {display?.footer && <div className="text-xs opacity-65"><TemplateText text={display.footer} /></div>}
      </div>
      {!!display?.buttons.length && <div className="divide-y divide-current/10 border-t border-current/10">
        {display.buttons.map((button, index) => {
          const Icon = button.type === 'URL' ? ArrowSquareOut : button.type === 'PHONE_NUMBER' ? Phone : ArrowBendUpLeft;
          return <div key={index} role="img" aria-label={`Botão ${button.text} (prévia)`} title="Prévia do botão recebido pelo cliente" className="flex min-h-10 items-center justify-center gap-2 px-2 py-2 text-sm font-medium text-blue-700 dark:text-blue-300">
            <Icon size={16} aria-hidden="true" /><span className="break-words">{button.text}</span>
          </div>;
        })}
      </div>}
    </div>
  );
}
