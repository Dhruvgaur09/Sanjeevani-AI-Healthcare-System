import React, { useState, useContext } from 'react';
import { GlobalContext } from '../App.jsx';

export default function Chatbot() {
  const { currentUser } = useContext(GlobalContext);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userEmail = currentUser?.email || 'guest@sanjeevni.app';
    const payload = {
      user: userEmail,
      message: input,
      apiKey: import.meta.env.VITE_GEMINI_API_KEY,
    };
    // optimistic UI
    setMessages(prev => [...prev, { role: 'user', text: input }]);
    setInput('');
    try {
      const res = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', text: data.reply }]);
    } catch (err) {
      console.error('Chat error:', err);
      setMessages(prev => [...prev, { role: 'assistant', text: 'Error contacting AI service.' }]);
    }
  };

  return (
    <div className="chatbot-container" style={{ color: 'white', padding: '20px' }}>
      <h2>AI Chatbot</h2>
      <div className="messages" style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '12px' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: '8px' }}>
            <strong>{m.role === 'user' ? 'You' : 'AI'}:</strong> {m.text}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask something…"
          style={{ flex: 1, padding: '8px', borderRadius: '6px' }}
        />
        <button onClick={sendMessage} style={{ padding: '8px 12px', borderRadius: '6px' }}>Send</button>
      </div>
    </div>
  );
}