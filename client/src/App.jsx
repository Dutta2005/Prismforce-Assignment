import { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function App() {
  const [role, setRole] = useState('employee');
  const [file, setFile] = useState(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

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
    event.preventDefault();
    setBusy(true);
    setAnswer(null);
    try {
      const response = await fetch(`${API_URL}/api/qa/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': role,
        },
        body: JSON.stringify({ question }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Question failed');
      setAnswer(data);
    } catch (error) {
      setAnswer({ answer: error.message, citations: [], refused: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <header>
        <p className="eyebrow">INTERNAL TOOLS / RAG PROTOTYPE</p>
        <h1>HR Policy Assistant</h1>
        <p className="lede">Answers come only from uploaded policy documents and every accepted answer cites its source.</p>
      </header>

      <section className="toolbar card">
        <div>
          <span className="label">Demo role</span>
          <div className="role-switch">
            <button className={role === 'employee' ? 'active' : ''} onClick={() => setRole('employee')}>Employee</button>
            <button className={role === 'admin' ? 'active' : ''} onClick={() => setRole('admin')}>Admin</button>
          </div>
        </div>
        <div className="role-note">
          Admin can index policy files. Employee can ask questions. The role is intentionally hardcoded for this assignment.
        </div>
      </section>

      {role === 'admin' && (
        <section className="card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ADMIN</p>
              <h2>Upload a policy</h2>
            </div>
            <span className="pill">.md / .txt / .pdf · 10 MB</span>
          </div>
          <form onSubmit={uploadPolicy} className="upload-form">
            <input type="file" accept=".md,.txt,.pdf,text/markdown,text/plain,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <button disabled={!file || busy}>{busy ? 'Indexing…' : 'Upload & index'}</button>
          </form>
          {status && <p className="status">{status}</p>}
        </section>
      )}

      <section className="card ask-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">EMPLOYEE</p>
            <h2>Ask about a policy</h2>
          </div>
          <span className="pill">Grounded RAG</span>
        </div>
        <form onSubmit={askQuestion}>
          <textarea
            rows="4"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. How many casual leave days can I carry forward?"
          />
          <div className="ask-row">
            <span>Try a factual question, a table lookup, then an off-policy question.</span>
            <button disabled={!question.trim() || busy}>{busy ? 'Thinking…' : 'Ask question'}</button>
          </div>
        </form>
      </section>

      {answer && (
        <section className={`answer card ${answer.refused ? 'refused' : ''}`}>
          <div className="answer-top">
            <div>
              <p className="eyebrow">RESULT</p>
              <h2>{answer.refused ? 'No grounded answer' : 'Grounded answer'}</h2>
            </div>
            <span className="pill">{answer.refused ? answer.reason || 'refused' : `${answer.citations?.length || 0} citation(s)`}</span>
          </div>
          <p className="answer-text">{answer.answer}</p>
          {answer.citations?.length > 0 && (
            <div className="citations">
              <p className="label">Citations</p>
              {answer.citations.map((citation) => (
                <div className="citation" key={citation.chunk_id}>
                  <strong>{citation.document_name}</strong>
                  <span>{citation.section}{citation.page && !String(citation.section).startsWith('Page ') ? ` · Page ${citation.page}` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}