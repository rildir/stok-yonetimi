import { Injectable, signal, inject, computed } from '@angular/core';
import { InventoryService, AiResponseCard } from '../inventory.service';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text?: string;
  timestamp: string; // ISO string for easy storage
  card?: AiResponseCard;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  timestamp: string;
}

@Injectable({ providedIn: 'root' })
export class UiStateService {
  private inventoryService = inject(InventoryService);

  toasts = signal<Toast[]>([]);
  isAiPanelOpen = signal(false);
  isAiLoading = signal(false);
  isHistorySidebarOpen = signal(false);

  sessions = signal<ChatSession[]>([]);
  activeSessionId = signal<string | null>(null);

  activeSession = computed(() => {
    return this.sessions().find(s => s.id === this.activeSessionId()) || null;
  });

  activeMessages = computed(() => {
    return this.activeSession()?.messages || [];
  });

  constructor() {
    this.loadSessions();
  }

  showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
    const id = Math.random().toString(36).substr(2, 9);
    this.toasts.update(t => [...t, { id, message, type }]);
    setTimeout(() => { this.removeToast(id); }, 3000);
  }

  removeToast(id: string) {
    this.toasts.update(t => t.filter(toast => toast.id !== id));
  }

  toggleAiPanel() {
    this.isAiPanelOpen.update(v => !v);
  }

  toggleHistorySidebar() {
    this.isHistorySidebarOpen.update(v => !v);
  }

  // --- Session Management ---
  loadSessions() {
    try {
      const saved = localStorage.getItem('smart_inventory_ai_sessions');
      if (saved) {
        const parsed = JSON.parse(saved) as ChatSession[];
        if (parsed && parsed.length > 0) {
          this.sessions.set(parsed);
          this.activeSessionId.set(parsed[0].id);
          return;
        }
      }
    } catch (e) {
      console.error('Error loading AI sessions', e);
    }
    
    // Default session if nothing exists
    this.createSession('Hoş Geldiniz');
  }

  saveSessions() {
    try {
      localStorage.setItem('smart_inventory_ai_sessions', JSON.stringify(this.sessions()));
    } catch (e) {
      console.error('Error saving AI sessions', e);
    }
  }

  createSession(customTitle?: string) {
    const id = Math.random().toString(36).substr(2, 9);
    const welcomeCard: AiResponseCard = {
      title: 'Yapay Zeka Asistanı Aktif',
      type: 'list',
      description: 'Stok yönetimi ve satış verileri hakkında doğal dilde sorular sorabilirsiniz. Örnek sorguları aşağıdan seçebilir veya kendiniz yazabilirsiniz.'
    };

    const newSession: ChatSession = {
      id,
      title: customTitle || 'Yeni Sohbet',
      timestamp: new Date().toISOString(),
      messages: [{
        id: 'welcome_' + id,
        sender: 'ai',
        timestamp: new Date().toISOString(),
        card: welcomeCard
      }]
    };

    this.sessions.update(s => [newSession, ...s]);
    this.activeSessionId.set(id);
    this.saveSessions();
  }

  deleteSession(id: string) {
    this.sessions.update(s => s.filter(session => session.id !== id));
    this.saveSessions();

    if (this.activeSessionId() === id) {
      const remaining = this.sessions();
      if (remaining.length > 0) {
        this.activeSessionId.set(remaining[0].id);
      } else {
        this.createSession();
      }
    }
  }

  selectSession(id: string) {
    this.activeSessionId.set(id);
  }

  updateSessionTitle(id: string, newTitle: string) {
    if (!newTitle.trim()) return;
    this.sessions.update(sessions => 
      sessions.map(s => {
        if (s.id === id) {
          return { ...s, title: newTitle };
        }
        return s;
      })
    );
    this.saveSessions();
  }

  isAiThinking = computed(() => {
    if (!this.isAiLoading()) return false;
    const msgs = this.activeMessages();
    if (msgs.length === 0) return true;
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg.sender === 'ai' && lastMsg.card && (lastMsg.card.thinking || lastMsg.card.description)) {
      return false;
    }
    return true;
  });

  private parsePartialField(partialJson: string, fieldName: string): string {
    const regex = new RegExp(`"${fieldName}"\\s*:\\s*"`);
    const match = partialJson.match(regex);
    if (!match) return '';
    const index = (match.index ?? 0) + match[0].length;
    const rest = partialJson.slice(index);
    
    let value = '';
    let escaped = false;
    for (let i = 0; i < rest.length; i++) {
      const char = rest[i];
      if (escaped) {
        value += char;
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        break;
      } else {
        value += char;
      }
    }
    return value.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  }

  private updateStreamingMessage(sessionId: string, messageId: string, description: string, thinking: string) {
    this.sessions.update(sessions =>
      sessions.map(s => {
        if (s.id === sessionId) {
          return {
            ...s,
            messages: s.messages.map(m => {
              if (m.id === messageId && m.card) {
                return {
                  ...m,
                  card: {
                    ...m.card,
                    description,
                    thinking: thinking || undefined
                  }
                };
              }
              return m;
            })
          };
        }
        return s;
      })
    );
  }

  private completeStreamingMessage(sessionId: string, messageId: string, finalCard: AiResponseCard) {
    this.sessions.update(sessions =>
      sessions.map(s => {
        if (s.id === sessionId) {
          const firstUserQuery = s.messages.find(m => m.sender === 'user')?.text || '';
          const updatedTitle = s.title === 'Yeni Sohbet' && firstUserQuery
            ? (firstUserQuery.length > 28 ? firstUserQuery.substring(0, 25) + '...' : firstUserQuery)
            : s.title;

          return {
            ...s,
            title: updatedTitle,
            timestamp: new Date().toISOString(),
            messages: s.messages.map(m => {
              if (m.id === messageId) {
                return {
                  ...m,
                  card: finalCard
                };
              }
              return m;
            })
          };
        }
        return s;
      })
    );
    this.isAiLoading.set(false);
    this.saveSessions();
  }

  async askQuestion(promptText: string) {
    if (!promptText.trim() || this.isAiLoading()) return;

    // Ensure we have an active session
    let currentSessionId = this.activeSessionId();
    if (!currentSessionId) {
      this.createSession();
      currentSessionId = this.activeSessionId();
    }

    const userMessage: ChatMessage = {
      id: Math.random().toString(36).substr(2, 9),
      sender: 'user',
      text: promptText,
      timestamp: new Date().toISOString()
    };

    // Append user message
    this.sessions.update(sessions => 
      sessions.map(s => {
        if (s.id === currentSessionId) {
          return {
            ...s,
            timestamp: new Date().toISOString(),
            messages: [...s.messages, userMessage]
          };
        }
        return s;
      })
    );
    this.saveSessions();

    this.isAiLoading.set(true);
    this.isAiPanelOpen.set(true);

    const aiMessageId = Math.random().toString(36).substr(2, 9);
    const streamingCard: AiResponseCard = {
      title: 'Analiz Raporu',
      type: 'list',
      description: ''
    };
    const aiPlaceholderMessage: ChatMessage = {
      id: aiMessageId,
      sender: 'ai',
      card: streamingCard,
      timestamp: new Date().toISOString()
    };

    // Append AI placeholder message
    this.sessions.update(sessions => 
      sessions.map(s => {
        if (s.id === currentSessionId) {
          return {
            ...s,
            messages: [...s.messages, aiPlaceholderMessage]
          };
        }
        return s;
      })
    );

    try {
      const token = localStorage.getItem('smart_inventory_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('http://localhost:3000/api/ai/query/stream', {
        method: 'POST',
        headers,
        body: JSON.stringify({ prompt: promptText })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body reader is not available');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const dataStr = trimmed.slice(6);
          try {
            const data = JSON.parse(dataStr);
            if (data.type === 'chunk') {
              const text = data.text;
              const rawDesc = this.parsePartialField(text, 'description');
              let thinking = '';
              let description = rawDesc;

              const thinkStart = rawDesc.indexOf('<think>');
              if (thinkStart !== -1) {
                const thinkEnd = rawDesc.indexOf('</think>');
                if (thinkEnd !== -1) {
                  thinking = rawDesc.slice(thinkStart + 7, thinkEnd).trim();
                  description = rawDesc.slice(thinkEnd + 8).trim();
                } else {
                  thinking = rawDesc.slice(thinkStart + 7).trim();
                  description = '';
                }
              }
              this.updateStreamingMessage(currentSessionId!, aiMessageId, description, thinking);
            } else if (data.type === 'complete') {
              this.completeStreamingMessage(currentSessionId!, aiMessageId, data.card);
              return;
            } else if (data.type === 'error') {
              throw new Error(data.message);
            }
          } catch (e) {
            console.error('Failed to parse SSE data line', line, e);
          }
        }
      }

      this.isAiLoading.set(false);
      this.saveSessions();
    } catch (err: any) {
      console.error('AI Streaming Error:', err);
      this.sessions.update(sessions => 
        sessions.map(s => {
          if (s.id === currentSessionId) {
            const filtered = s.messages.filter(m => m.id !== aiMessageId);
            const errorMessage: ChatMessage = {
              id: Math.random().toString(36).substr(2, 9),
              sender: 'ai',
              text: 'Yapay zeka servisinden yanıt alınamadı. Lütfen internet bağlantınızı ve sunucuyu kontrol edin.',
              timestamp: new Date().toISOString()
            };
            return {
              ...s,
              messages: [...filtered, errorMessage]
            };
          }
          return s;
        })
      );
      this.isAiLoading.set(false);
      this.saveSessions();
      this.showToast('Yapay Zeka servisi ile iletişim kurulamadı.', 'error');
    }
  }
}

