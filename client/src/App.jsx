import { useState, useRef, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function App() {
  const [role, setRole] = useState('employee');
  const [file, setFile] = useState(null);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]); // Array of chat messages
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [question]);

  // Auto-scroll to bottom of chat when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  async function uploadPolicy(event) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setStatus('Indexing policy…');
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch(`${API_URL}/api/policies/upload`, {
        method: 'POST',
        headers: { 'x-user-role': role },
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Upload failed');
      setStatus(`Indexed ${data.chunks_indexed} chunks from ${data.document_name}${data.pages ? ` · ${data.pages} pages` : ''}.`);
      setFile(null);
      event.target.reset();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function askQuestion(event) {
    if (event) event.preventDefault();
    if (!question.trim()) return;

    const currentQuestion = question;
    setQuestion('');
    
    // Add the user's question to the chat history
    setMessages((prev) => [...prev, { role: 'user', text: currentQuestion }]);
    
    setBusy(true);

    try {
      const response = await fetch(`${API_URL}/api/qa/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': role,
        },
        body: JSON.stringify({ question: currentQuestion }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Question failed');
      
      // Add the assistant's response to the chat history
      setMessages((prev) => [
        ...prev, 
        { role: 'assistant', text: data.answer, citations: data.citations, refused: data.refused }
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev, 
        { role: 'assistant', text: error.message, citations: [], refused: true }
      ]);
    } finally {
      setBusy(false);
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      askQuestion();
    }
  };

  return (
    <div className="flex h-screen bg-white font-sans text-gray-800">
      {/* Sidebar */}
      <aside className="w-72 bg-[#171717] text-gray-300 flex flex-col flex-shrink-0">
        <div className="p-4">
          <h1 className="font-semibold text-lg text-white flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z" />
              </svg>
            </div>
            HR Policy Assistant
          </h1>
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          <div className="mb-8">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 block px-2">User Role</label>
            <div className="flex bg-[#212121] rounded-lg p-1">
              <button
                className={`flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-colors ${role === 'employee' ? 'bg-[#2f2f2f] text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
                onClick={() => setRole('employee')}
              >
                Employee
              </button>
              <button
                className={`flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-colors ${role === 'admin' ? 'bg-[#2f2f2f] text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
                onClick={() => setRole('admin')}
              >
                Admin
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-3 leading-relaxed px-2">
              Admin can index policy files. Employee can ask questions.
            </p>
          </div>

          {role === 'admin' && (
            <div className="mb-6">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 block px-2">Knowledge Base</label>
              <div className="bg-[#212121] rounded-xl p-4 border border-[#2f2f2f]">
                <form onSubmit={uploadPolicy} className="flex flex-col gap-3">
                  <input
                    type="file"
                    accept=".md,.txt,.pdf,text/markdown,text/plain,application/pdf"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-[#2f2f2f] file:text-white hover:file:bg-[#3f3f3f] cursor-pointer"
                  />
                  <button
                    disabled={!file || busy}
                    className="w-full bg-white text-black rounded-lg py-2 px-4 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 transition-colors"
                  >
                    {busy ? 'Indexing...' : 'Upload & Index'}
                  </button>
                </form>
                {status && <p className="text-xs text-gray-400 mt-3">{status}</p>}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0">
        <div className="flex-1 overflow-y-auto w-full scroll-smooth">
          {messages.length === 0 && !busy ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto px-6 pb-20">
              <div className="w-16 h-16 bg-black text-white rounded-full flex items-center justify-center mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-8 h-8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                </svg>
              </div>
              <h2 className="text-2xl font-medium mb-3 text-gray-900">How can I help you today?</h2>
              <p className="text-gray-500 mb-8">Ask me anything about the company's HR policies.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                <button onClick={() => setQuestion("How many casual leave days can I carry forward?")} className="border border-gray-200 rounded-xl p-4 text-left hover:bg-gray-50 transition-colors">
                  <div className="font-medium text-sm text-gray-700">Casual Leaves</div>
                  <div className="text-xs text-gray-500 mt-1">Check the carry forward policy</div>
                </button>
                <button onClick={() => setQuestion("What is the policy for maternity leave?")} className="border border-gray-200 rounded-xl p-4 text-left hover:bg-gray-50 transition-colors">
                  <div className="font-medium text-sm text-gray-700">Maternity Leave</div>
                  <div className="text-xs text-gray-500 mt-1">Learn about duration and benefits</div>
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full pb-40 pt-8 flex flex-col gap-8">
              {messages.map((msg, index) => (
                <div key={index} className={`px-4 md:px-8 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start gap-4'}`}>
                  {msg.role === 'user' ? (
                    <div className="bg-gray-100 rounded-3xl px-5 py-3 text-[15px] leading-relaxed text-gray-900 max-w-[80%]">
                      {msg.text}
                    </div>
                  ) : (
                    <>
                      <div className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5 text-gray-800">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 10.5h.008v.008H8.25V10.5Zm3.75 0h.008v.008H12V10.5Zm3.75 0h.008v.008H15.75V10.5Zm-7.5 4.5h.008v.008H8.25V15Zm3.75 0h.008v.008H12V15Zm3.75 0h.008v.008H15.75V15ZM3 19.125A2.625 2.625 0 0 0 5.625 21h12.75A2.625 2.625 0 0 0 21 19.125v-10.5A2.625 2.625 0 0 0 18.375 6H5.625A2.625 2.625 0 0 0 3 8.625v10.5ZM18.375 6V4.5a2.625 2.625 0 0 0-2.625-2.625H8.25A2.625 2.625 0 0 0 5.625 4.5V6" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] leading-relaxed text-gray-900">
                          <p className={msg.refused ? 'text-red-600' : ''}>{msg.text}</p>
                          
                          {msg.citations?.length > 0 && (
                            <div className="mt-6 pt-4">
                              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Sources</p>
                              <div className="flex flex-wrap gap-2">
                                {msg.citations.map((citation, i) => (
                                  <div key={citation.chunk_id || i} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs hover:bg-gray-100 transition-colors cursor-default">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-3.5 h-3.5 text-gray-400">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                                    </svg>
                                    <span className="font-semibold text-gray-700">{citation.document_name}</span>
                                    <span className="text-gray-400">·</span>
                                    <span className="text-gray-500">{citation.section}{citation.page && !String(citation.section).startsWith('Page ') ? ` (p. ${citation.page})` : ''}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}

              {/* Loading Indicator */}
              {busy && (
                <div className="px-4 md:px-8 flex gap-4">
                  <div className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5 text-gray-800">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 10.5h.008v.008H8.25V10.5Zm3.75 0h.008v.008H12V10.5Zm3.75 0h.008v.008H15.75V10.5Zm-7.5 4.5h.008v.008H8.25V15Zm3.75 0h.008v.008H12V15Zm3.75 0h.008v.008H15.75V15ZM3 19.125A2.625 2.625 0 0 0 5.625 21h12.75A2.625 2.625 0 0 0 21 19.125v-10.5A2.625 2.625 0 0 0 18.375 6H5.625A2.625 2.625 0 0 0 3 8.625v10.5ZM18.375 6V4.5a2.625 2.625 0 0 0-2.625-2.625H8.25A2.625 2.625 0 0 0 5.625 4.5V6" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="py-2 flex items-center gap-1.5 text-gray-500">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Invisible element to act as scroll target */}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white to-transparent pt-10 pb-6 px-4 md:px-8">
          <div className="max-w-3xl mx-auto w-full relative">
            <form onSubmit={askQuestion} className="relative flex items-end shadow-md rounded-2xl bg-[#f4f4f4] focus-within:bg-white border border-transparent focus-within:border-gray-300 transition-colors">
              <textarea
                ref={textareaRef}
                rows="1"
                className="w-full py-3.5 pl-4 pr-12 bg-transparent border-0 outline-none resize-none overflow-y-auto text-gray-800 text-[15px] leading-relaxed placeholder-gray-500 rounded-2xl"
                placeholder="Message HR Assistant..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                style={{ minHeight: '52px', maxHeight: '200px' }}
              />
              <button
                type="submit"
                disabled={!question.trim() || busy}
                className="absolute right-2 bottom-2 p-1.5 bg-black text-white rounded-lg disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M11.47 2.47a.75.75 0 0 1 1.06 0l7.5 7.5a.75.75 0 1 1-1.06 1.06l-6.22-6.22V21a.75.75 0 0 1-1.5 0V4.81l-6.22 6.22a.75.75 0 1 1-1.06-1.06l7.5-7.5Z" clipRule="evenodd" />
                </svg>
              </button>
            </form>
            <div className="text-center mt-2 text-xs text-gray-400">
              Try a factual question, a table lookup, then an off-policy question.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}