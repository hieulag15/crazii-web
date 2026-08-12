/**
 * Footer component — hiển thị ở dưới cùng tất cả trang
 * Attribution: Phước Báu Community + Key Level System
 */

interface FooterProps {
  variant?: 'dark' | 'minimal';
}

export default function Footer({ variant = 'dark' }: FooterProps) {
  const year = new Date().getFullYear();

  if (variant === 'minimal') {
    return (
      <footer style={{
        padding: '8px 20px',
        borderTop: '1px solid #1e2d4a',
        background: '#060d1a',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '0.72rem', color: '#334155' }}>
          🔑 Key Level System © {year}
        </span>
        <span style={{ fontSize: '0.72rem', color: '#334155' }}>
          Kiến thức từ 🌸{' '}
          <a
            href="https://t.me/PhuocBauCommunity"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#f9a8d4', textDecoration: 'none' }}
          >
            Phước Báu Community
          </a>
        </span>
      </footer>
    );
  }

  return (
    <footer style={{
      padding: '14px 24px',
      borderTop: '1px solid #1e2d4a',
      background: '#0a1628',
      flexShrink: 0,
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        maxWidth: 1200,
        margin: '0 auto',
      }}>
        {/* Left: branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.1rem' }}>🔑</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#fbbf24' }}>Key Level System</div>
            <div style={{ fontSize: '0.72rem', color: '#475569' }}>Trading tool · © {year}</div>
          </div>
        </div>

        {/* Center: attribution */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: 3 }}>
            📚 Kiến thức được đúc kết từ
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.95rem' }}>🌸</span>
            <a
              href="https://t.me/PhuocBauCommunity"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: '#f9a8d4',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '0.85rem',
              }}
            >
              Phước Báu Community
            </a>
          </div>
          <div style={{ fontSize: '0.7rem', color: '#334155', marginTop: 2 }}>
            Narrative Alert · Phân tích dòng tiền · DeFi Research
          </div>
        </div>

        {/* Right: disclaimer */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.68rem', color: '#334155', maxWidth: 220, lineHeight: 1.5 }}>
            ⚠️ Không phải lời khuyên đầu tư. Tự chịu trách nhiệm với các quyết định giao dịch của bạn.
          </div>
        </div>
      </div>
    </footer>
  );
}
