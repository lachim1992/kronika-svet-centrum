import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import FramePanel from "./FramePanel";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";

export interface TextFeedItem {
  id: string;
  title: string;
  meta?: string;
  content: ReactNode;
  defaultOpen?: boolean;
}

interface TextFeedProps {
  title?: string;
  headerRight?: ReactNode;
  items: TextFeedItem[];
  className?: string;
  emptyMessage?: string;
}

const TextFeed = ({
  title,
  headerRight,
  items,
  className,
  emptyMessage = "Žádné záznamy",
}: TextFeedProps) => {
  return (
    <FramePanel
      variant="parchment"
      title={title}
      headerRight={headerRight}
      className={className}
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">{emptyMessage}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Collapsible key={item.id} defaultOpen={item.defaultOpen}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group py-2 px-3 rounded-lg hover:bg-secondary/50 transition-colors">
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90 shrink-0" />
                <span className="font-display text-sm font-semibold text-foreground truncate">
                  {item.title}
                </span>
                {item.meta && (
                  <span className="text-[10px] text-muted-foreground ml-auto shrink-0 font-mono">
                    {item.meta}
                  </span>
                )}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="pl-9 pr-3 pb-3 text-sm text-foreground/85 prose-chronicle leading-relaxed">
                  {item.content}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      )}
    </FramePanel>
  );
};

export default TextFeed;
