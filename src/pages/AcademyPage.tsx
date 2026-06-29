import { useState, useEffect } from 'react';

interface AcademyPageProps {
  onBack: () => void;
}

type TopicId = 'op' | 'candles' | 'mlp_ktr' | 'sharks' | 'diamonds';

export default function AcademyPage({ onBack }: AcademyPageProps) {
  const [activeTopic, setActiveTopic] = useState<TopicId>('op');

  // Interactive Signal Checker States
  const [chkAboveOP, setChkAboveOP] = useState<boolean>(true);
  const [chkCandle, setChkCandle] = useState<'yellow' | 'red' | 'zebra'>('yellow');
  const [chkKSI, setChkKSI] = useState<'green' | 'red' | 'neutral'>('green');
  const [chkKCX, setChkKCX] = useState<'green' | 'black' | 'blue' | 'neutral'>('black');
  const [chkAboveMLP, setChkAboveMLP] = useState<boolean>(true);
  const [chkAbovePivot, setChkAbovePivot] = useState<boolean>(true);
  const [chkAboveEMA200, setChkAboveEMA200] = useState<boolean>(true);
  const [chkDMLBreak, setChkDMLBreak] = useState<boolean>(false);
  const [chkFVGConfluence, setChkFVGConfluence] = useState<boolean>(false);

  // Score Calculation logic
  const [score, setScore] = useState<number>(0);
  const [verdict, setVerdict] = useState<{ text: string; color: string; desc: string }>({ text: '', color: '', desc: '' });

  useEffect(() => {
    let s = 0;
    const details: string[] = [];

    // OP Rule (25 pts)
    if (chkAboveOP && chkCandle === 'yellow') {
      s += 25;
      details.push('+25: Thuận OP (Giá TRÊN OP + Nến VÀNG)');
    } else if (!chkAboveOP && chkCandle === 'red') {
      s += 25;
      details.push('+25: Thuận OP (Giá DƯỚI OP + Nến ĐỎ)');
    } else {
      // Counter-trend penalty
      s -= 15;
      details.push('-15: Ngược luật OP! (Tuyệt đối không nên trade)');
    }

    // MLP Rule (12 pts)
    if (chkAboveOP === chkAboveMLP) {
      s += 12;
      details.push('+12: Đồng thuận MLP');
    }

    // KSI Shark (15 pts)
    if (chkCandle === 'yellow' && chkKSI === 'green') {
      s += 15;
      details.push('+15: Cá mập gom hàng (KSI Xanh)');
    } else if (chkCandle === 'red' && chkKSI === 'red') {
      s += 15;
      details.push('+15: Cá mập xả hàng (KSI Đỏ)');
    }

    // KCX Sentiment (10 pts)
    if (chkCandle === 'yellow' && chkKCX === 'black') {
      s += 10;
      details.push('+10: Nhỏ lẻ đang mua đuổi (KCX Đen)');
    } else if (chkCandle === 'yellow' && chkKCX === 'green') {
      s += 12; // Flashing Green exhaustion is great for reversal
      details.push('+12: Nhỏ lẻ cạn lực bán (KCX Xanh lá)');
    } else if (chkCandle === 'red' && chkKCX === 'blue') {
      s += 10;
      details.push('+10: Nhỏ lẻ đang bán tháo (KCX Xanh dương)');
    }

    // Pivot (10 pts)
    if (chkAboveOP === chkAbovePivot) {
      s += 10;
      details.push('+10: Thuận hướng Pivot');
    }

    // WMA/EMA200 (10 pts)
    if (chkAboveOP === chkAboveEMA200) {
      s += 10;
      details.push('+10: Thuận xu hướng dài hạn EMA200');
    }

    // Diamond Line (DML) / FVG / OB (Remaining confluences)
    if (chkDMLBreak) {
      s += 10;
      details.push('+10: Phá vỡ Diamond Line');
    }
    if (chkFVGConfluence) {
      s += 8;
      details.push('+8: Hợp lưu vùng FVG/OB');
    }

    // Zebra penalty
    if (chkCandle === 'zebra') {
      s = 30; // Maximum cap or hard reset
    }

    const finalScore = Math.max(0, Math.min(100, s));
    setScore(finalScore);

    // Determine diagnosis
    if (chkCandle === 'zebra') {
      setVerdict({
        text: 'NẾN ZEBRA (ĐỨNG NGOÀI)',
        color: '#f59e0b',
        desc: 'Thị trường đang nén chặt hoặc đi ngang khó chịu (Zebra / Doji). Hãy kiên nhẫn đứng ngoài quan sát để tránh quét SL.',
      });
    } else if (finalScore >= 80) {
      const type = chkCandle === 'yellow' ? 'BIG BUY' : 'BIG SELL';
      setVerdict({
        text: `TÍN HIỆU ĐẸP (${type})`,
        color: '#22c55e',
        desc: `Độ tin cậy cực cao (${finalScore}%). Các điều kiện hội tụ OP, KSI và KCX đồng thuận hoàn hảo. Có thể cân nhắc mở vị thế giao dịch theo quy tắc quản lý vốn R:R gợi ý.`,
      });
    } else if (finalScore >= 60) {
      const type = chkCandle === 'yellow' ? 'BUY' : 'SELL';
      setVerdict({
        text: `TÍN HIỆU NHẸ (${type})`,
        color: '#3b82f6',
        desc: `Độ tin cậy trung bình (${finalScore}%). Đủ điều kiện tối thiểu nhưng thiếu một vài yếu tố hợp lưu mạnh. Thích hợp cho lệnh scalp nhỏ.`,
      });
    } else {
      setVerdict({
        text: 'TÍN HIỆU RỦI RO CAO (BỎ QUA)',
        color: '#ef4444',
        desc: `Điểm số quá thấp (${finalScore}%). Tín hiệu đi ngược hướng OP hoặc thiếu dòng tiền thông minh đồng thuận. Tuyệt đối không giao dịch.`,
      });
    }
  }, [chkAboveOP, chkCandle, chkKSI, chkKCX, chkAboveMLP, chkAbovePivot, chkAboveEMA200, chkDMLBreak, chkFVGConfluence]);

  return (
    <div style={styles.container}>
      {/* Sticky Header */}
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backBtn}>← Quay lại chart</button>
        <h2 style={styles.title}>📖 Học Viện Kiến Thức CRAZII</h2>
      </div>

      <div style={styles.content}>
        {/* Left Column: Topics and Theory */}
        <div style={styles.leftCol}>
          <div style={styles.topicTabs}>
            <button
              onClick={() => setActiveTopic('op')}
              style={{ ...styles.tab, ...(activeTopic === 'op' ? styles.tabActive : {}) }}
            >
              🔑 1. Nguyên Tắc OP (Quyết định hướng)
            </button>
            <button
              onClick={() => setActiveTopic('candles')}
              style={{ ...styles.tab, ...(activeTopic === 'candles' ? styles.tabActive : {}) }}
            >
              🎨 2. Màu Nến Crazii (Điểm kích hoạt)
            </button>
            <button
              onClick={() => setActiveTopic('mlp_ktr')}
              style={{ ...styles.tab, ...(activeTopic === 'mlp_ktr' ? styles.tabActive : {}) }}
            >
              📈 3. MLP & KTR (Mục tiêu & Động lượng)
            </button>
            <button
              onClick={() => setActiveTopic('sharks')}
              style={{ ...styles.tab, ...(activeTopic === 'sharks' ? styles.tabActive : {}) }}
            >
              🦈 4. KSI & KCX (Dòng tiền Cá mập)
            </button>
            <button
              onClick={() => setActiveTopic('diamonds')}
              style={{ ...styles.tab, ...(activeTopic === 'diamonds' ? styles.tabActive : {}) }}
            >
              💎 5. Kim Cương & EMA200
            </button>
          </div>

          {/* Theory card content */}
          <div style={styles.theoryCard}>
            {activeTopic === 'op' && (
              <div>
                <h3 style={styles.theoryTitle}>Nguyên Tắc OP (Opening Price) — Hạt Nhân Quyết Định Xu Hướng</h3>
                <blockquote style={styles.quote}>
                  "Sai lầm lớn nhất của người mới là mở biểu đồ lên và phân vân không biết hôm nay nên Buy hay Sell. Thay vì dùng hàng tá chỉ báo rối rắm, CRAZII dùng đúng một điểm neo: Đường OP."
                </blockquote>
                <p style={styles.para}>
                  <strong>Định nghĩa:</strong> OP là giá mở cửa lúc bắt đầu ngày giao dịch mới (quy chuẩn 5h sáng giờ Việt Nam / GMT+7). Đây được ví như "Mỏ neo định hướng giao dịch".
                </p>
                <div style={styles.ruleBox}>
                  <h4 style={{ color: '#ffd700', marginBottom: '8px' }}>Quy tắc bất di bất dịch:</h4>
                  <ul style={styles.ul}>
                    <li>📈 <strong>Giá ở TRÊN đường OP:</strong> Thị trường đang tăng giá, phe Mua làm chủ. Chỉ ưu tiên tìm kiếm lệnh <strong>BUY (Long)</strong>.</li>
                    <li>📉 <strong>Giá ở DƯỚI đường OP:</strong> Thị trường đang giảm giá, phe Bán làm chủ. Chỉ ưu tiên tìm kiếm lệnh <strong>SELL (Short)</strong>.</li>
                  </ul>
                </div>
                <p style={styles.para}>
                  <strong>Ý nghĩa:</strong> Bằng cách tôn trọng giá mở cửa OP, bạn luôn đi đúng hướng cùng dòng tiền của các tổ chức lớn, hạn chế tối đa việc đi ngược xu hướng.
                </p>
              </div>
            )}

            {activeTopic === 'candles' && (
              <div>
                <h3 style={styles.theoryTitle}>Màu Nến Crazii (Điểm kích hoạt lệnh)</h3>
                <p style={styles.para}>
                  Hệ thống CRAZII loại bỏ các nhiễu của nến thường bằng cách tích hợp Heiken Ashi Smooth và thuật toán cấu trúc toán học độc quyền để chuyển đổi thành hai màu sắc trực quan:
                </p>
                <div style={styles.candleColors}>
                  <div style={styles.candleSampleYellow}>■ Nến Vàng: Thể hiện lực mua áp đảo.</div>
                  <div style={styles.candleSampleRed}>■ Nến Đỏ: Thể hiện lực bán áp đảo.</div>
                </div>
                <div style={styles.ruleBox}>
                  <h4 style={{ color: '#ffd700', marginBottom: '8px' }}>Tín hiệu kích hoạt (CCRY và CCYR):</h4>
                  <ul style={styles.ul}>
                    <li>🟢 <strong>CCRY (Đỏ sang Vàng):</strong> Giá nến đỏ đổi màu sang nến vàng. Chỉ có giá trị kích hoạt BUY khi <strong>giá đang nằm trên OP</strong>.</li>
                    <li>🔴 <strong>CCYR (Vàng sang Đỏ):</strong> Giá nến vàng đổi màu sang nến đỏ. Chỉ có giá trị kích hoạt SELL khi <strong>giá đang nằm dưới OP</strong>.</li>
                    <li>⚠️ <strong>Zebra (Nến vằn dưa hấu):</strong> Các nến đỏ và vàng đan xen liên tục thể hiện sự giằng co lưỡng lự. <strong>Hãy đứng ngoài thị trường</strong> vì đây là dấu hiệu sideway nén mạnh.</li>
                  </ul>
                </div>
              </div>
            )}

            {activeTopic === 'mlp_ktr' && (
              <div>
                <h3 style={styles.theoryTitle}>MLP & KTR — Mục tiêu chốt lời & Xác nhận động lượng</h3>
                <p style={styles.para}>
                  <strong>MLP (Mid-Level Price):</strong> Là mức giá trung bình của ngày hôm trước (giữa giá mở cửa OP và giá đóng cửa của phiên trước).
                </p>
                <div style={styles.ruleBox}>
                  <h4 style={{ color: '#ffd700', marginBottom: '8px' }}>Sức mạnh đồng thuận xu hướng:</h4>
                  <ul style={styles.ul}>
                    <li>🔥 <strong>Uptrend bền vững:</strong> Khi giá nằm <strong>TRÊN cả OP và MLP</strong>.</li>
                    <li>❄️ <strong>Downtrend tuyệt đối:</strong> Khi giá nằm <strong>DƯỚI cả OP và MLP</strong>.</li>
                  </ul>
                </div>

                <p style={styles.para}>
                  <strong>KTR (Volatility Statistics / Projected Range):</strong> Là các mốc biên độ biến động được tính toán dựa trên ATR của ngày hôm trước và giữ cố định suốt phiên.
                </p>
                <div style={styles.ruleBox}>
                  <h4 style={{ color: '#ffd700', marginBottom: '8px' }}>Bản đồ chốt lời (TP):</h4>
                  <ul style={styles.ul}>
                    <li>🟢 Đối với lệnh BUY: TP1 tại <strong>KTR+1</strong>, TP2 tại <strong>KTR+2</strong>, TP3 tại <strong>KTR+3</strong>.</li>
                    <li>🔴 Đối với lệnh SELL: TP1 tại <strong>KTR-1</strong>, TP2 tại <strong>KTR-2</strong>, TP3 tại <strong>KTR-3</strong>.</li>
                    <li><em>Lưu ý: CRAZII khuyên bạn nên chốt lời 70% khối lượng khi giá chạm mốc KTR±1 đầu tiên.</em></li>
                  </ul>
                </div>
              </div>
            )}

            {activeTopic === 'sharks' && (
              <div>
                <h3 style={styles.theoryTitle}>KSI & KCX — Giải mã dòng tiền Cá mập và Sự kiệt sức của Nhỏ lẻ</h3>
                <p style={styles.para}>
                  Để tránh bẫy thị trường, hệ thống CRAZII tích hợp 2 chỉ số dòng tiền quan trọng:
                </p>
                <div style={styles.metricGrid}>
                  <div style={styles.metricCard}>
                    <h4 style={{ color: '#22c55e' }}>🦈 KSI (Shark Money Flow)</h4>
                    <p style={{ fontSize: '0.8rem', color: '#ccc', marginTop: '6px' }}>
                      Chỉ số hành động của cá mập.
                      <br />🟢 <strong>Màu Xanh:</strong> Cá mập đang thu gom hàng (Uu tiên BUY).
                      <br />🔴 <strong>Màu Đỏ:</strong> Cá mập đang bán xả hàng (Ưu tiên SELL).
                    </p>
                  </div>
                  <div style={styles.metricCard}>
                    <h4 style={{ color: '#00f0ff' }}>📉 KCX (Retail Sentiment)</h4>
                    <p style={{ fontSize: '0.8rem', color: '#ccc', marginTop: '6px' }}>
                      Đo lường tâm lý và sự kiệt sức của đám đông nhỏ lẻ.
                      <br />⚫ <strong>Màu Đen:</strong> Nhỏ lẻ đang ham hố MUA đuổi.
                      <br />🔵 <strong>Màu Xanh Dương:</strong> Nhỏ lẻ đang hoảng loạn BÁN tháo.
                      <br />🟢 <strong>Màu Xanh Lá Nhấp Nháy:</strong> Nhỏ lẻ đã hoàn toàn CẠN LỰC BÁN (Thời điểm vàng để cá mập kích hoạt đảo chiều tăng giá).
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTopic === 'diamonds' && (
              <div>
                <h3 style={styles.theoryTitle}>Kim Cương (Diamond Signal) & EMA200</h3>
                <p style={styles.para}>
                  <strong>Chỉ báo Kim cương:</strong> Xuất hiện khi dòng tiền thông minh tạo một áp lực cực hạn tại một vùng giá nén. Khi biểu tượng kim cương xuất hiện, nó sẽ vẽ ra một đường gọi là <strong>DML (Diamond Line)</strong> tại giá đóng cửa của nến đó.
                </p>
                <div style={styles.ruleBox}>
                  <h4 style={{ color: '#ffd700', marginBottom: '8px' }}>Cách giao dịch theo Diamond Line:</h4>
                  <ul style={styles.ul}>
                    <li>💎 <strong>Tín hiệu Buy cực mạnh:</strong> Nến vàng đóng cửa vượt TRÊN đường Diamond Line (DML) đồng thời giá nằm trên OP.</li>
                    <li>💎 <strong>Tín hiệu Sell cực mạnh:</strong> Nến đỏ đóng cửa thủng DƯỚI đường Diamond Line (DML) đồng thời giá nằm dưới OP.</li>
                  </ul>
                </div>
                <p style={styles.para}>
                  <strong>EMA200 (WMA/EMA200 Daily):</strong> Được sử dụng làm đường xu hướng dài hạn. Giao dịch thuận xu hướng dài hạn bằng cách so sánh giá với EMA200 sẽ cộng thêm điểm cộng (Confidence) rất lớn cho tín hiệu của bạn.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Interactive Signal Checker */}
        <div style={styles.rightCol}>
          <div style={styles.checkerCard}>
            <h3 style={styles.checkerTitle}>⚡ Trình Kiểm Tra Tín Hiệu (Confluence Checker)</h3>
            <p style={{ fontSize: '0.8rem', color: '#8892b0', marginBottom: '1rem' }}>
              Hãy nhập các điều kiện thực tế trên chart để kiểm tra xem tín hiệu đó đúng hay sai và chấm điểm độ tin cậy.
            </p>

            <div style={styles.formGroup}>
              <label style={styles.label}>1. Vị trí giá so với đường OP:</label>
              <div style={styles.btnGroup}>
                <button
                  onClick={() => setChkAboveOP(true)}
                  style={{ ...styles.choiceBtn, ...(chkAboveOP ? styles.choiceBtnActiveBuy : {}) }}
                >
                  Giá TRÊN OP (Ưu tiên Buy)
                </button>
                <button
                  onClick={() => setChkAboveOP(false)}
                  style={{ ...styles.choiceBtn, ...(!chkAboveOP ? styles.choiceBtnActiveSell : {}) }}
                >
                  Giá DƯỚI OP (Ưu tiên Sell)
                </button>
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>2. Trạng thái Màu nến Crazii:</label>
              <div style={styles.btnGroup}>
                <button
                  onClick={() => setChkCandle('yellow')}
                  style={{ ...styles.choiceBtn, ...(chkCandle === 'yellow' ? styles.choiceBtnActiveBuy : {}) }}
                >
                  Nến Vàng 🟡
                </button>
                <button
                  onClick={() => setChkCandle('red')}
                  style={{ ...styles.choiceBtn, ...(chkCandle === 'red' ? styles.choiceBtnActiveSell : {}) }}
                >
                  Nến Đỏ 🔴
                </button>
                <button
                  onClick={() => setChkCandle('zebra')}
                  style={{ ...styles.choiceBtn, ...(chkCandle === 'zebra' ? styles.choiceBtnActiveZebra : {}) }}
                >
                  Nến Vằn (Zebra) 🦓
                </button>
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>3. Dòng tiền cá mập (KSI):</label>
              <div style={styles.btnGroup}>
                <button
                  onClick={() => setChkKSI('green')}
                  style={{ ...styles.choiceBtn, ...(chkKSI === 'green' ? styles.choiceBtnActiveBuy : {}) }}
                >
                  Xanh (Gom) 🟢
                </button>
                <button
                  onClick={() => setChkKSI('red')}
                  style={{ ...styles.choiceBtn, ...(chkKSI === 'red' ? styles.choiceBtnActiveSell : {}) }}
                >
                  Đỏ (Xả) 🔴
                </button>
                <button
                  onClick={() => setChkKSI('neutral')}
                  style={{ ...styles.choiceBtn, ...(chkKSI === 'neutral' ? styles.choiceBtnActiveNeutral : {}) }}
                >
                  Không rõ ⚪
                </button>
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>4. Chỉ báo tâm lý nhỏ lẻ (KCX):</label>
              <div style={styles.btnGroup}>
                <button
                  onClick={() => setChkKCX('green')}
                  style={{ ...styles.choiceBtn, ...(chkKCX === 'green' ? styles.choiceBtnActiveBuy : {}) }}
                >
                  Xanh lá (Kiệt sức bán)
                </button>
                <button
                  onClick={() => setChkKCX('black')}
                  style={{ ...styles.choiceBtn, ...(chkKCX === 'black' ? styles.choiceBtnActiveNeutral : {}) }}
                >
                  Đen (Đang mua)
                </button>
                <button
                  onClick={() => setChkKCX('blue')}
                  style={{ ...styles.choiceBtn, ...(chkKCX === 'blue' ? styles.choiceBtnActiveSell : {}) }}
                >
                  Xanh dương (Đang bán)
                </button>
              </div>
            </div>

            <div style={styles.checkboxSection}>
              <h4 style={{ color: '#ffd700', fontSize: '0.85rem', marginBottom: '8px' }}>Các hợp lưu nâng cao khác:</h4>
              <label style={styles.chkLabel}>
                <input type="checkbox" checked={chkAboveMLP} onChange={(e) => setChkAboveMLP(e.target.checked)} style={styles.chk} />
                Đồng thuận với MLP (Giá ở cùng phía OP và MLP)
              </label>
              <label style={styles.chkLabel}>
                <input type="checkbox" checked={chkAbovePivot} onChange={(e) => setChkAbovePivot(e.target.checked)} style={styles.chk} />
                Đồng thuận Pivot kháng cự/hỗ trợ ngày
              </label>
              <label style={styles.chkLabel}>
                <input type="checkbox" checked={chkAboveEMA200} onChange={(e) => setChkAboveEMA200(e.target.checked)} style={styles.chk} />
                Đồng thuận xu hướng dài hạn EMA200
              </label>
              <label style={styles.chkLabel}>
                <input type="checkbox" checked={chkDMLBreak} onChange={(e) => setChkDMLBreak(e.target.checked)} style={styles.chk} />
                Phá vỡ vùng Kim Cương (DML Line)
              </label>
              <label style={styles.chkLabel}>
                <input type="checkbox" checked={chkFVGConfluence} onChange={(e) => setChkFVGConfluence(e.target.checked)} style={styles.chk} />
                Nằm tại vùng phản ứng FVG hoặc Order Block (ICT)
              </label>
            </div>

            {/* Diagnostic Output */}
            <div style={{ ...styles.verdictCard, borderColor: verdict.color }}>
              <div style={styles.verdictHeader}>
                <span style={styles.verdictTitle}>KẾT QUẢ ĐÁNH GIÁ:</span>
                <span style={{ ...styles.verdictBadge, color: verdict.color, borderColor: verdict.color }}>
                  {verdict.text}
                </span>
              </div>
              <div style={styles.scoreWrap}>
                <span style={styles.scoreLabel}>Độ tin cậy (Confidence):</span>
                <span style={{ ...styles.scoreVal, color: verdict.color }}>{score}%</span>
              </div>
              <p style={styles.verdictDesc}>{verdict.desc}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    background: '#060d1a',
    color: '#e0e0e0',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 24px',
    background: '#0a1628',
    borderBottom: '1px solid #1e2d4a',
    flexShrink: 0,
    gap: '20px',
  },
  backBtn: {
    padding: '6px 12px',
    background: '#1a2744',
    border: '1px solid #2a3f5f',
    borderRadius: '6px',
    color: '#00f0ff',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 600,
    transition: 'all 0.2s',
  },
  title: {
    fontSize: '1.2rem',
    fontWeight: 800,
    color: '#ffd700',
  },
  content: {
    display: 'flex',
    flex: 1,
    padding: '24px',
    gap: '24px',
    overflowY: 'auto' as const,
    minHeight: 0,
  },
  leftCol: {
    flex: 1.2,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  rightCol: {
    flex: 1,
    overflowY: 'auto' as const,
  },
  topicTabs: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    background: '#0a1628',
    padding: '12px',
    borderRadius: '12px',
    border: '1px solid #1e2d4a',
  },
  tab: {
    padding: '10px 16px',
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: '8px',
    color: '#8892b0',
    textAlign: 'left' as const,
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 600,
    transition: 'all 0.2s',
  },
  tabActive: {
    background: '#1a2744',
    borderColor: '#2a3f5f',
    color: '#ffd700',
  },
  theoryCard: {
    background: '#0a1628',
    border: '1px solid #1e2d4a',
    borderRadius: '12px',
    padding: '24px',
    flex: 1,
    overflowY: 'auto' as const,
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
  },
  theoryTitle: {
    fontSize: '1.2rem',
    color: '#ffd700',
    marginBottom: '12px',
    fontWeight: 700,
  },
  quote: {
    fontStyle: 'italic',
    color: '#8892b0',
    borderLeft: '4px solid #ffd700',
    paddingLeft: '16px',
    margin: '16px 0',
    lineHeight: '1.6',
  },
  para: {
    fontSize: '0.9rem',
    lineHeight: '1.6',
    color: '#ccc',
    marginBottom: '12px',
  },
  ruleBox: {
    background: '#132238',
    border: '1px solid #1e2d4a',
    borderRadius: '8px',
    padding: '16px',
    margin: '16px 0',
  },
  ul: {
    paddingLeft: '20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    fontSize: '0.88rem',
  },
  candleColors: {
    display: 'flex',
    gap: '16px',
    margin: '16px 0',
  },
  candleSampleYellow: {
    flex: 1,
    background: 'rgba(255, 215, 0, 0.1)',
    border: '1px solid #ffd700',
    padding: '12px',
    borderRadius: '8px',
    color: '#ffd700',
    fontSize: '0.85rem',
    fontWeight: 600,
    textAlign: 'center' as const,
  },
  candleSampleRed: {
    flex: 1,
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid #ef4444',
    padding: '12px',
    borderRadius: '8px',
    color: '#ef4444',
    fontSize: '0.85rem',
    fontWeight: 600,
    textAlign: 'center' as const,
  },
  metricGrid: {
    display: 'flex',
    gap: '16px',
    margin: '16px 0',
  },
  metricCard: {
    flex: 1,
    background: '#0d1b2a',
    border: '1px solid #1e2d4a',
    borderRadius: '8px',
    padding: '16px',
  },
  checkerCard: {
    background: '#0a1628',
    border: '1px solid #1e2d4a',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  checkerTitle: {
    fontSize: '1.15rem',
    color: '#ffd700',
    fontWeight: 700,
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  label: {
    fontSize: '0.85rem',
    color: '#8892b0',
    fontWeight: 600,
  },
  btnGroup: {
    display: 'flex',
    gap: '6px',
  },
  choiceBtn: {
    flex: 1,
    padding: '8px 10px',
    background: '#132238',
    border: '1px solid #2a3f5f',
    borderRadius: '6px',
    color: '#8892b0',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 600,
    transition: 'all 0.15s',
  },
  choiceBtnActiveBuy: {
    background: 'rgba(34, 197, 94, 0.15)',
    borderColor: '#22c55e',
    color: '#22c55e',
  },
  choiceBtnActiveSell: {
    background: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#ef4444',
    color: '#ef4444',
  },
  choiceBtnActiveZebra: {
    background: 'rgba(245, 158, 11, 0.15)',
    borderColor: '#f59e0b',
    color: '#f59e0b',
  },
  choiceBtnActiveNeutral: {
    background: 'rgba(255, 255, 255, 0.08)',
    borderColor: '#888',
    color: '#e0e0e0',
  },
  checkboxSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    borderTop: '1px solid #1e2d4a',
    paddingTop: '16px',
  },
  chkLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '0.8rem',
    color: '#ccc',
    cursor: 'pointer',
    padding: '4px 0',
  },
  chk: {
    width: '16px',
    height: '16px',
    accentColor: '#ffd700',
  },
  verdictCard: {
    marginTop: '8px',
    border: '1px dashed',
    borderRadius: '10px',
    padding: '16px',
    background: 'rgba(0,0,0,0.2)',
  },
  verdictHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  verdictTitle: {
    fontSize: '0.8rem',
    fontWeight: 700,
    color: '#8892b0',
  },
  verdictBadge: {
    fontSize: '0.8rem',
    fontWeight: 800,
    padding: '2px 8px',
    border: '1px solid',
    borderRadius: '4px',
  },
  scoreWrap: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    marginBottom: '10px',
  },
  scoreLabel: {
    fontSize: '0.85rem',
    color: '#e0e0e0',
  },
  scoreVal: {
    fontSize: '1.4rem',
    fontWeight: 800,
  },
  verdictDesc: {
    fontSize: '0.82rem',
    lineHeight: '1.5',
    color: '#bbb',
  },
};
