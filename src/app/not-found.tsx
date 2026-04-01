export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000000',
        color: '#FFFFFF',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: '48px', fontWeight: 800, margin: 0, color: '#c8a96b' }}>404</h1>
      <p style={{ fontSize: '16px', color: '#9CA3AF', marginTop: '12px' }}>Page not found</p>
      <a
        href="/"
        style={{
          marginTop: '24px',
          padding: '10px 24px',
          border: '2px solid #c8a96b',
          borderRadius: '8px',
          color: '#c8a96b',
          textDecoration: 'none',
          fontSize: '14px',
          fontWeight: 600,
        }}
      >
        Back to Dashboard
      </a>
    </div>
  );
}
