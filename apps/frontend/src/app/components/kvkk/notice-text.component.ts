import { Component, Input, computed, signal } from '@angular/core';
import { DemoNoticeComponent } from '../shared/demo-notice.component';

interface Block {
  kind: 'h' | 'p' | 'li';
  parts: { text: string; bold: boolean }[];
}

/** Renders a notice body (headings "## ", list items "- ", **bold**) without innerHTML. */
export function noticeBlocks(body: string | null | undefined): Block[] {
  const blocks: Block[] = [];
  for (const raw of String(body || '').split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    const kind: Block['kind'] = line.startsWith('## ') ? 'h' : line.startsWith('- ') ? 'li' : 'p';
    const text = kind === 'h' ? line.slice(3) : kind === 'li' ? line.slice(2) : line;
    const parts = text.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((t) => (t.startsWith('**') && t.endsWith('**') ? { text: t.slice(2, -2), bold: true } : { text: t, bold: false }));
    blocks.push({ kind, parts });
  }
  return blocks;
}

@Component({
  selector: 'app-notice-text',
  standalone: true,
  imports: [DemoNoticeComponent],
  styles: [`
    :host { display: block; font-size: var(--text-sm); line-height: 1.6; color: var(--color-text); }
    h4 { font-size: var(--text-sm); font-weight: var(--weight-semibold); margin: var(--space-4) 0 var(--space-1); }
    p { margin: 0 0 var(--space-2); }
    ul { margin: 0 0 var(--space-2); padding-left: var(--space-5); }
    li { margin-bottom: var(--space-1); }
  `],
  template: `
    @if (demo) { <app-demo-notice /> }
    @for (b of blocks(); track $index) {
      @switch (b.kind) {
        @case ('h') { <h4>@for (p of b.parts; track $index) { @if (p.bold) { <strong>{{ p.text }}</strong> } @else { {{ p.text }} } }</h4> }
        @case ('li') { <ul><li>@for (p of b.parts; track $index) { @if (p.bold) { <strong>{{ p.text }}</strong> } @else { {{ p.text }} } }</li></ul> }
        @default { <p>@for (p of b.parts; track $index) { @if (p.bold) { <strong>{{ p.text }}</strong> } @else { {{ p.text }} } }</p> }
      }
    }
  `,
})
export class NoticeTextComponent {
  /** Prepends the demo / portfolio disclaimer (off where the container already shows it). */
  @Input() demo = true;
  private body = signal('');
  @Input() set text(v: string | null | undefined) {
    this.body.set(v || '');
  }
  blocks = computed(() => noticeBlocks(this.body()));
}
