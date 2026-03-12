import { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

interface TagSelectorProps {
  entityType: 'contact' | 'opportunity';
  entityId: string;
  organizationId: string;
}

export function TagSelector({ entityType, entityId, organizationId }: TagSelectorProps) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [assignedTagIds, setAssignedTagIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);

  const fetchData = async () => {
    const [tagsRes, assignmentsRes] = await Promise.all([
      supabase
        .from('tags')
        .select('id, name, color')
        .eq('organization_id', organizationId)
        .order('name'),
      supabase
        .from('tag_assignments')
        .select('tag_id')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .eq('organization_id', organizationId),
    ]);

    if (tagsRes.data) setAllTags(tagsRes.data);
    if (assignmentsRes.data) {
      setAssignedTagIds(new Set(assignmentsRes.data.map((a) => a.tag_id)));
    }
  };

  useEffect(() => {
    if (organizationId && entityId) fetchData();
  }, [organizationId, entityId, entityType]);

  const assignTag = async (tagId: string) => {
    const { error } = await supabase.from('tag_assignments').insert({
      tag_id: tagId,
      entity_type: entityType,
      entity_id: entityId,
      organization_id: organizationId,
    });
    if (!error) {
      setAssignedTagIds((prev) => new Set(prev).add(tagId));
    }
  };

  const removeTag = async (tagId: string) => {
    const { error } = await supabase
      .from('tag_assignments')
      .delete()
      .eq('tag_id', tagId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .eq('organization_id', organizationId);
    if (!error) {
      setAssignedTagIds((prev) => {
        const next = new Set(prev);
        next.delete(tagId);
        return next;
      });
    }
  };

  const assignedTags = allTags.filter((t) => assignedTagIds.has(t.id));
  const unassignedTags = allTags.filter((t) => !assignedTagIds.has(t.id));

  const getTagStyle = (color: string | null) => {
    if (!color) return {};
    return {
      backgroundColor: `${color}20`,
      color: color,
      borderColor: `${color}40`,
    };
  };

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-2">Etiquetas</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {assignedTags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium"
            style={getTagStyle(tag.color)}
          >
            {tag.name}
            <button
              onClick={() => removeTag(tag.id)}
              className="ml-0.5 rounded-full p-0.5 hover:opacity-70 transition-opacity"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start">
            {unassignedTags.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">
                {allTags.length === 0 ? 'Nenhuma etiqueta cadastrada' : 'Todas já atribuídas'}
              </p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {unassignedTags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => {
                      assignTag(tag.id);
                      if (unassignedTags.length <= 1) setOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-2 py-1.5 rounded-md text-sm hover:bg-accent transition-colors",
                      "flex items-center gap-2"
                    )}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: tag.color || 'hsl(var(--muted-foreground))' }}
                    />
                    {tag.name}
                  </button>
                ))}
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
