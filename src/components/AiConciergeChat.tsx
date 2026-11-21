'use client';

import React, { useState } from 'react';
import { MessageCircle, Send, X, Sparkles } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function AiConciergeChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        '¡Hola! Soy el asistente de Sabor Goo Maldonado. Charlemos de lo que quieras o pregúntame por nuestros chivitos, hamburguesas, napolitanas al instante y cómo comer gratis con 10 referidos.',
    },
  ]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const nextHistory: ChatMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextHistory);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: nextHistory.slice(-10),
        }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            data.reply || data.error || '¡Hola! Estoy por acá en Sabor Goo Maldonado. ¿En qué te doy una mano?',
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Tuve un breve corte de señal, pero aquí sigo. ¿Sobre qué te gustaría charlar o qué chivito te tienta?',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open ? (
        <div className="w-[340px] sm:w-[380px] bg-slate-900 border border-orange-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[500px]">
          <div className="bg-gradient-to-r from-orange-600 to-amber-600 px-4 py-3 flex items-center justify-between text-white">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              <div>
                <p className="font-bold text-sm leading-tight">Asistente Sabor Goo 24/7</p>
                <p className="text-[11px] text-orange-100">En línea · Maldonado & Playa Mansa</p>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-black/20" aria-label="Cerrar chat">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-3 space-y-2.5 overflow-y-auto flex-1 bg-slate-950/90 text-sm">
            {messages.map((msg, idx) => (
              <div key={idx} className={`p-3 rounded-2xl whitespace-pre-line leading-relaxed ${msg.role === 'user' ? 'bg-orange-600 text-white ml-8' : 'bg-slate-800 text-slate-100 mr-6 border border-slate-700'}`}>
                {msg.content}
              </div>
            ))}
            {loading && <div className="text-xs text-slate-400 animate-pulse px-2">Escribiendo respuesta...</div>}
          </div>
          <form onSubmit={handleSend} className="p-2.5 bg-slate-900 border-t border-slate-800 flex items-center gap-2">
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Charla de lo que quieras o pide menú..." className="flex-1 bg-slate-800 text-white text-sm rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-orange-500" />
            <button type="submit" disabled={loading || !input.trim()} className="bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white p-2.5 rounded-xl transition">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-2 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white font-bold px-4 py-3.5 rounded-full shadow-xl shadow-orange-950/50 transition">
          <MessageCircle className="w-5 h-5" />
          <span className="text-sm">Chat Sabor Goo</span>
        </button>
      )}
    </div>
  );
}
