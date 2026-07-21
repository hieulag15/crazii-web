import { useState } from 'react';

interface AcademyPageProps { onBack: () => void; }
type TopicId = 'overview' | 'op' | 'candles' | 'ksi_kcx' | 'ktr' | 'diamond' | 'entry' | 'tp_sl';

const TOPICS: { id: TopicId; icon: string; label: string }[] = [
  { id: 'overview', icon: '🎯', label: 'Tổng quan hệ thống' },
  { id: 'op', icon: '🔑', label: 'Luật OP (Quan trọng nhất)' },
  { id: 'candles', icon: '🕯️', label: 'Nến Vàng/Đỏ & Zebra' },
  { id: 'ksi_kcx', icon: '🦈', label: 'KSI & KCX (Dòng tiền)' },
  { id: 'ktr', icon: '📊', label: 'KTR & MLP (Chốt lời)' },
  { id: 'diamond', icon: '💎', label: 'Kim Cương & EMA200' },
  { id: 'entry', icon: '⚡', label: 'Cách vào lệnh' },
  { id: 'tp_sl', icon: '🎯', label: 'Cách đặt TP/SL' },
];

export default function AcademyPage({ onBack }: AcademyPageProps) {
  const [activeTopic, setActiveTopic] = useState<TopicId>('overview');
  return (
    <div style={S.container}>
      <header style={S.header}>
        <button onClick={onBack} style={S.backBtn}>← Quay lại Chart</button>
        <h2 style={S.title}>📖 Học Viện CRAZII Trading</h2>
        <span style={S.subtitle}>Kiến thức nền tảng &amp; Logic hệ thống</span>
      </header>
      <div style={S.body}>
        <nav style={S.sidebar}>
          {TOPICS.map(t => (
            <button key={t.id} onClick={() => setActiveTopic(t.id)}
              style={{ ...S.navItem, ...(activeTopic === t.id ? S.navItemActive : {}) }}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </nav>
        <main style={S.main}>
          {renderTopic(activeTopic)}
        </main>
      </div>
    </div>
  );
}

function renderTopic(id: TopicId) {
  switch (id) {
    case 'overview': return <Overview />;
    case 'op': return <OpSection />;
    case 'candles': return <CandlesSection />;
    case 'ksi_kcx': return <KsiKcxSection />;
    case 'ktr': return <KtrSection />;
    case 'diamond': return <DiamondSection />;
    case 'entry': return <EntrySection />;
    case 'tp_sl': return <TpSlSection />;
  }
}

function Overview() {
  return (
    <article style={S.article}>
      <h3 style={S.h3}>🎯 Tổng Quan Hệ Thống CRAZII</h3>
      <p style={S.p}>CRAZII Trading System là hệ thống giao dịch dựa trên <strong>dòng tiền thông minh</strong> (Smart Money) kết hợp quy tắc quản lý rủi ro nghiêm ngặt. Hệ thống giúp trader loại bỏ cảm xúc, đưa ra quyết định dựa trên dữ liệu khách quan.</p>
      <div style={S.infoBox}>
        <h4 style={S.h4}>Các thành phần cốt lõi:</h4>
        <div style={S.grid2}>
          <div style={S.miniCard}><span style={{color:'#fbbf24'}}>🔑 OP</span><br/><small>Xác định hướng BUY/SELL duy nhất trong ngày (⭐⭐⭐⭐⭐)</small></div>
          <div style={S.miniCard}><span style={{color:'#fbbf24'}}>🕯️ Nến Vàng/Đỏ</span><br/><small>Điểm kích hoạt vào lệnh (⭐⭐⭐⭐)</small></div>
          <div style={S.miniCard}><span style={{color:'#22c55e'}}>🦈 KSI</span><br/><small>Dòng tiền cá mập gom/xả (⭐⭐⭐⭐)</small></div>
          <div style={S.miniCard}><span style={{color:'#06b6d4'}}>📉 KCX</span><br/><small>Tâm lý & kiệt sức nhỏ lẻ (⭐⭐⭐)</small></div>
          <div style={S.miniCard}><span style={{color:'#22c55e'}}>📊 KTR</span><br/><small>Mục tiêu chốt lời trong ngày (⭐⭐⭐)</small></div>
          <div style={S.miniCard}><span style={{color:'#a855f7'}}>📐 MLP</span><br/><small>Xác nhận đồng thuận xu hướng (⭐⭐⭐⭐)</small></div>
          <div style={S.miniCard}><span style={{color:'#ec4899'}}>🔄 PIVOT</span><br/><small>Hỗ trợ/kháng cự phiên trước (⭐⭐⭐⭐⭐)</small></div>
          <div style={S.miniCard}><span style={{color:'#06b6d4'}}>💎 Kim Cương</span><br/><small>Tín hiệu đảo chiều cực mạnh (⭐⭐⭐⭐)</small></div>
        </div>
      </div>
      <div style={S.warningBox}><strong>⚠️ Nguyên tắc vàng:</strong> Luôn tuân thủ Luật OP trước tất cả. Không có chỉ báo nào override được quy tắc OP.</div>
    </article>
  );
}

function OpSection() {
  return (
    <article style={S.article}>
      <h3 style={S.h3}>🔑 Luật OP — Hạt Nhân Quyết Định Xu Hướng</h3>
      <blockquote style={S.quote}>"Sai lầm lớn nhất của người mới là mở chart lên và phân vân không biết hôm nay nên Buy hay Sell. CRAZII dùng đúng một điểm neo: Đường OP."</blockquote>
      <p style={S.p}><strong>Định nghĩa:</strong> OP (Opening Price) là giá mở cửa lúc 5h sáng (GMT+7). Đây là "mỏ neo định hướng giao dịch" cho cả ngày.</p>
      <div style={S.ruleBox}>
        <h4 style={S.h4}>Quy tắc bất di bất dịch:</h4>
        <ul style={S.ul}>
          <li>📈 <strong>Giá TRÊN OP:</strong> Phe Mua làm chủ → Chỉ ưu tiên <span style={{color:'#22c55e',fontWeight:'bold'}}>BUY (Long)</span></li>
          <li>📉 <strong>Giá DƯỚI OP:</strong> Phe Bán làm chủ → Chỉ ưu tiên <span style={{color:'#ef4444',fontWeight:'bold'}}>SELL (Short)</span></li>
        </ul>
      </div>
      <div style={S.tipBox}>
        <strong>💡 Mẹo thực chiến:</strong> Khi giá cắt qua OP nhiều lần liên tục (sideway quanh OP), đó là dấu hiệu thị trường đang "lưỡng lự". Tốt nhất nên đứng ngoài chờ giá xác nhận rõ ràng phía nào.
      </div>
      <p style={S.p}><strong>Ý nghĩa:</strong> Bằng cách tôn trọng OP, bạn luôn đi đúng hướng cùng dòng tiền của tổ chức lớn, hạn chế tối đa việc trade ngược xu hướng — nguyên nhân #1 gây cháy tài khoản.</p>
    </article>
  );
}

function CandlesSection() {
  return (
    <article style={S.article}>
      <h3 style={S.h3}>🕯️ Nến Vàng/Đỏ & Zebra — Điểm Kích Hoạt Lệnh</h3>
      <p style={S.p}>Hệ thống CRAZII dùng Heiken Ashi Smooth để chuyển đổi nến thường thành 2 màu trực quan, loại bỏ nhiễu:</p>
      <div style={{display:'flex',gap:'12px',marginBottom:'16px'}}>
        <div style={{flex:1,background:'rgba(251,191,36,0.1)',border:'1px solid #fbbf24',borderRadius:'8px',padding:'12px',textAlign:'center'}}>
          <div style={{fontSize:'1.5rem'}}>🟡</div>
          <strong style={{color:'#fbbf24'}}>Nến Vàng</strong>
          <p style={{fontSize:'0.8rem',color:'#cbd5e1',margin:'4px 0 0'}}>Lực MUA áp đảo</p>
        </div>
        <div style={{flex:1,background:'rgba(239,68,68,0.1)',border:'1px solid #ef4444',borderRadius:'8px',padding:'12px',textAlign:'center'}}>
          <div style={{fontSize:'1.5rem'}}>🔴</div>
          <strong style={{color:'#ef4444'}}>Nến Đỏ</strong>
          <p style={{fontSize:'0.8rem',color:'#cbd5e1',margin:'4px 0 0'}}>Lực BÁN áp đảo</p>
        </div>
        <div style={{flex:1,background:'rgba(234,179,8,0.1)',border:'1px solid #eab308',borderRadius:'8px',padding:'12px',textAlign:'center'}}>
          <div style={{fontSize:'1.5rem'}}>🦓</div>
          <strong style={{color:'#eab308'}}>Nến Zebra</strong>
          <p style={{fontSize:'0.8rem',color:'#cbd5e1',margin:'4px 0 0'}}>Giằng co → ĐỨNG NGOÀI</p>
        </div>
      </div>
      <div style={S.ruleBox}>
        <h4 style={S.h4}>Tín hiệu kích hoạt (CCRY / CCYR):</h4>
        <ul style={S.ul}>
          <li>🟢 <strong>CCRY (Đỏ → Vàng):</strong> Nến đỏ đổi sang vàng. Chỉ có giá trị BUY khi giá đang <strong>TRÊN OP</strong>.</li>
          <li>🔴 <strong>CCYR (Vàng → Đỏ):</strong> Nến vàng đổi sang đỏ. Chỉ có giá trị SELL khi giá đang <strong>DƯỚI OP</strong>.</li>
          <li>⚠️ <strong>Zebra:</strong> Nến đỏ/vàng đan xen liên tục = sideway nén mạnh. <strong>Tuyệt đối đứng ngoài.</strong></li>
        </ul>
      </div>
      <div style={S.tipBox}><strong>💡 Lưu ý:</strong> Cần ít nhất 3-4 cây nến cùng màu liên tiếp tăng/giảm dần để xác nhận xu hướng đủ mạnh trước khi vào lệnh.</div>
    </article>
  );
}

function KsiKcxSection() {
  return (
    <article style={S.article}>
      <h3 style={S.h3}>🦈 KSI & KCX — Giải Mã Dòng Tiền Cá Mập</h3>
      <p style={S.p}>Để tránh bẫy thị trường, CRAZII tích hợp 2 chỉ số dòng tiền quan trọng giúp bạn biết "ai đang làm gì":</p>
      <div style={{display:'flex',gap:'12px',marginBottom:'16px',flexWrap:'wrap'}}>
        <div style={{flex:1,minWidth:'250px',background:'#0f172a',border:'1px solid #1e2d4a',borderRadius:'10px',padding:'16px'}}>
          <h4 style={{color:'#22c55e',margin:'0 0 8px'}}>🦈 KSI (Shark Money Flow)</h4>
          <p style={{fontSize:'0.85rem',color:'#cbd5e1',lineHeight:'1.6'}}>Chỉ số hành động của cá mập (tổ chức lớn):</p>
          <ul style={S.ul}>
            <li><span style={{color:'#22c55e'}}>🟢 Xanh:</span> Cá mập đang <strong>gom hàng</strong> → Ưu tiên BUY</li>
            <li><span style={{color:'#ef4444'}}>🔴 Đỏ:</span> Cá mập đang <strong>xả hàng</strong> → Ưu tiên SELL</li>
          </ul>
        </div>
        <div style={{flex:1,minWidth:'250px',background:'#0f172a',border:'1px solid #1e2d4a',borderRadius:'10px',padding:'16px'}}>
          <h4 style={{color:'#06b6d4',margin:'0 0 8px'}}>📉 KCX (Retail Sentiment)</h4>
          <p style={{fontSize:'0.85rem',color:'#cbd5e1',lineHeight:'1.6'}}>Đo tâm lý & sự kiệt sức của đám đông nhỏ lẻ:</p>
          <ul style={S.ul}>
            <li><span style={{color:'#1e293b',background:'#e2e8f0',padding:'0 4px',borderRadius:'3px'}}>⚫ Đen:</span> Nhỏ lẻ đang ham hố <strong>MUA đuổi</strong></li>
            <li><span style={{color:'#3b82f6'}}>🔵 Xanh dương:</span> Nhỏ lẻ đang hoảng loạn <strong>BÁN tháo</strong></li>
            <li><span style={{color:'#22c55e'}}>🟢 Xanh lá nhấp nháy:</span> Nhỏ lẻ <strong>CẠN LỰC BÁN</strong> — thời điểm vàng cá mập kích hoạt đảo chiều tăng</li>
          </ul>
        </div>
      </div>
      <div style={S.ruleBox}>
        <h4 style={S.h4}>Cách kết hợp KSI + KCX:</h4>
        <ul style={S.ul}>
          <li><strong>BUY mạnh:</strong> Nến Vàng + Giá trên OP + KSI Xanh + KCX Đen (nhỏ lẻ mua đuổi)</li>
          <li><strong>SELL mạnh:</strong> Nến Đỏ + Giá dưới OP + KSI Đỏ + KCX Xanh dương (nhỏ lẻ bán tháo)</li>
          <li><strong>Đảo chiều tăng:</strong> KCX Xanh lá nhấp nháy + KSI chuyển Xanh = cá mập bắt đáy</li>
        </ul>
      </div>
    </article>
  );
}

function KtrSection() {
  return (
    <article style={S.article}>
      <h3 style={S.h3}>📊 KTR & MLP — Mục Tiêu Chốt Lời & Xác Nhận Xu Hướng</h3>
      <div style={S.infoBox}>
        <h4 style={S.h4}>📐 MLP (Mid-Level Price)</h4>
        <p style={S.p}>Mức giá trung bình giữa OP hôm nay và giá đóng cửa phiên trước. Dùng để xác nhận sức mạnh xu hướng:</p>
        <ul style={S.ul}>
          <li>🔥 <strong>Uptrend bền vững:</strong> Giá nằm <strong>TRÊN cả OP và MLP</strong></li>
          <li>❄️ <strong>Downtrend tuyệt đối:</strong> Giá nằm <strong>DƯỚI cả OP và MLP</strong></li>
          <li>⚠️ Giá giữa OP và MLP = tín hiệu yếu, cần thêm hợp lưu</li>
        </ul>
      </div>
      <div style={S.infoBox}>
        <h4 style={S.h4}>📊 KTR (Volatility Statistics / Projected Range)</h4>
        <p style={S.p}>Các mốc biên độ biến động tính từ ATR phiên trước, cố định suốt ngày. Đây là "bản đồ chốt lời":</p>
        <div style={{display:'flex',gap:'10px',marginBottom:'12px',flexWrap:'wrap'}}>
          <div style={{flex:1,minWidth:'140px',background:'rgba(34,197,94,0.1)',border:'1px solid #22c55e40',borderRadius:'8px',padding:'10px',textAlign:'center'}}>
            <div style={{color:'#22c55e',fontWeight:'bold'}}>Lệnh BUY</div>
            <div style={{fontSize:'0.8rem',color:'#cbd5e1',marginTop:'4px'}}>TP1: KTR+1<br/>TP2: KTR+2<br/>TP3: KTR+3</div>
          </div>
          <div style={{flex:1,minWidth:'140px',background:'rgba(239,68,68,0.1)',border:'1px solid #ef444440',borderRadius:'8px',padding:'10px',textAlign:'center'}}>
            <div style={{color:'#ef4444',fontWeight:'bold'}}>Lệnh SELL</div>
            <div style={{fontSize:'0.8rem',color:'#cbd5e1',marginTop:'4px'}}>TP1: KTR-1<br/>TP2: KTR-2<br/>TP3: KTR-3</div>
          </div>
        </div>
      </div>
      <div style={S.ruleBox}>
        <h4 style={S.h4}>Chiến lược chốt lời theo KTR:</h4>
        <ul style={S.ul}>
          <li><strong>KTR±1:</strong> Chốt <strong>70%</strong> khối lượng (tỷ lệ chạm ~80%)</li>
          <li><strong>KTR±2:</strong> Chốt <strong>20%</strong> khối lượng (tỷ lệ chạm ~60-65%)</li>
          <li><strong>KTR±3:</strong> Chốt <strong>10%</strong> còn lại (tỷ lệ chạm &gt;40%)</li>
        </ul>
      </div>
    </article>
  );
}

function DiamondSection() {
  return (
    <article style={S.article}>
      <h3 style={S.h3}>💎 Kim Cương & EMA200 — Tín Hiệu Đảo Chiều Cực Mạnh</h3>
      <div style={S.infoBox}>
        <h4 style={S.h4}>💎 Chỉ Báo Kim Cương (Diamond Signal)</h4>
        <p style={S.p}>Xuất hiện khi dòng tiền thông minh tạo áp lực cực hạn tại vùng giá nén. Khi kim cương xuất hiện, nó vẽ ra đường <strong>DML (Diamond Line)</strong> tại giá đóng cửa nến đó.</p>
        <ul style={S.ul}>
          <li>💎 <strong>Buy cực mạnh:</strong> Nến vàng đóng cửa vượt TRÊN DML + Giá trên OP</li>
          <li>💎 <strong>Sell cực mạnh:</strong> Nến đỏ đóng cửa thủng DƯỚI DML + Giá dưới OP</li>
          <li>⚠️ <strong>Kim Cương Lồng:</strong> Khi xuất hiện kim cương thứ 2 ngược chiều → chốt lời hoặc kéo SL về entry ngay</li>
        </ul>
      </div>
      <div style={S.infoBox}>
        <h4 style={S.h4}>📐 EMA200 — Xu Hướng Dài Hạn</h4>
        <p style={S.p}>EMA200 là đường xu hướng dài hạn (Daily). Trade thuận hướng EMA200 giúp tăng confidence đáng kể:</p>
        <ul style={S.ul}>
          <li>Giá <strong>TRÊN</strong> EMA200 + BUY = <span style={{color:'#22c55e'}}>+10% confidence</span></li>
          <li>Giá <strong>DƯỚI</strong> EMA200 + SELL = <span style={{color:'#22c55e'}}>+10% confidence</span></li>
          <li>Trade ngược EMA200 = <span style={{color:'#ef4444'}}>giảm độ tin cậy, cần nhiều hợp lưu hơn</span></li>
        </ul>
      </div>
    </article>
  );
}

function EntrySection() {
  return (
    <article style={S.article}>
      <h3 style={S.h3}>⚡ Cách Vào Lệnh — Tam Điểm Hội Tụ</h3>
      <p style={S.p}>Hệ thống CRAZII yêu cầu ít nhất 3 điều kiện hội tụ trước khi vào lệnh. Càng nhiều hợp lưu, tín hiệu càng mạnh.</p>
      <div style={{display:'flex',gap:'12px',marginBottom:'16px',flexWrap:'wrap'}}>
        <div style={{flex:1,minWidth:'280px',background:'rgba(34,197,94,0.05)',border:'1px solid #22c55e40',borderRadius:'10px',padding:'16px'}}>
          <h4 style={{color:'#22c55e',margin:'0 0 10px'}}>🟢 Tam Điểm Hội Tụ BUY</h4>
          <ol style={{...S.ul,paddingLeft:'20px'}}>
            <li>✅ 3-4 cây nến <strong>VÀNG</strong> tăng dần liên tiếp</li>
            <li>✅ Giá đóng <strong>TRÊN OP</strong></li>
            <li>✅ KSI <strong>Xanh</strong> (Cá mập đang gom)</li>
            <li>✅ KCX <strong>Đen</strong> (Nhỏ lẻ đang mua đuổi)</li>
          </ol>
          <div style={{marginTop:'10px',padding:'8px',background:'#0f172a',borderRadius:'6px',fontSize:'0.8rem',color:'#94a3b8'}}>
            <strong>SL:</strong> Dưới cụm nến vàng (đáy swing)<br/>
            <strong>TP:</strong> 1R trở lên hoặc gồng tới KTR+1/+2
          </div>
        </div>
        <div style={{flex:1,minWidth:'280px',background:'rgba(239,68,68,0.05)',border:'1px solid #ef444440',borderRadius:'10px',padding:'16px'}}>
          <h4 style={{color:'#ef4444',margin:'0 0 10px'}}>🔴 Tam Điểm Hội Tụ SELL</h4>
          <ol style={{...S.ul,paddingLeft:'20px'}}>
            <li>✅ 3-4 cây nến <strong>ĐỎ</strong> giảm dần liên tiếp</li>
            <li>✅ Giá đóng <strong>DƯỚI OP</strong></li>
            <li>✅ KSI <strong>Đỏ</strong> (Cá mập đang xả)</li>
            <li>✅ KCX <strong>Xanh dương</strong> (Nhỏ lẻ đang bán tháo)</li>
          </ol>
          <div style={{marginTop:'10px',padding:'8px',background:'#0f172a',borderRadius:'6px',fontSize:'0.8rem',color:'#94a3b8'}}>
            <strong>SL:</strong> Trên cụm nến đỏ (đỉnh swing)<br/>
            <strong>TP:</strong> 1R trở lên hoặc gồng tới KTR-1/-2
          </div>
        </div>
      </div>
      <div style={S.warningBox}>
        <strong>⚠️ Tuyệt đối KHÔNG vào lệnh khi:</strong>
        <ul style={{...S.ul,marginTop:'6px'}}>
          <li>Nến Zebra (sideway nén) — đứng ngoài chờ</li>
          <li>Giá ngược luật OP (VD: muốn BUY nhưng giá dưới OP)</li>
          <li>KSI và màu nến trái chiều nhau</li>
          <li>Ngoài khung giờ GTH tốt (6-11h, 20-00h)</li>
        </ul>
      </div>
    </article>
  );
}

function TpSlSection() {
  return (
    <article style={S.article}>
      <h3 style={S.h3}>🎯 Cách Đặt TP/SL — Quản Lý Rủi Ro</h3>
      <p style={S.p}>Quản lý vốn là yếu tố sống còn. CRAZII áp dụng nguyên tắc R:R (Risk:Reward) nghiêm ngặt để bảo vệ tài khoản.</p>
      <div style={S.ruleBox}>
        <h4 style={S.h4}>📍 Cách đặt Stop Loss (SL):</h4>
        <ul style={S.ul}>
          <li><strong>Lệnh BUY:</strong> SL đặt dưới đáy cụm nến vàng (swing low) hoặc dưới Key Level hỗ trợ gần nhất</li>
          <li><strong>Lệnh SELL:</strong> SL đặt trên đỉnh cụm nến đỏ (swing high) hoặc trên Key Level kháng cự gần nhất</li>
          <li>Thêm buffer 0.5-1% để tránh bị quét SL do nhiễu</li>
        </ul>
      </div>
      <div style={S.ruleBox}>
        <h4 style={S.h4}>🎯 Cách đặt Take Profit (TP):</h4>
        <ul style={S.ul}>
          <li><strong>TP1 (Chốt 70%):</strong> Tại KTR±1 — mức an toàn nhất, tỷ lệ chạm ~80%</li>
          <li><strong>TP2 (Chốt 20%):</strong> Tại KTR±2 — mức vừa phải, tỷ lệ chạm ~60%</li>
          <li><strong>TP3 (Chốt 10%):</strong> Tại KTR±3 — gồng xa, tỷ lệ chạm ~40%</li>
          <li>Hoặc dùng Key Level (support/resistance) gần nhất làm TP</li>
        </ul>
      </div>
      <div style={S.infoBox}>
        <h4 style={S.h4}>📐 Nguyên tắc R:R tối thiểu:</h4>
        <ul style={S.ul}>
          <li>R:R tối thiểu <strong>1:1.5</strong> mới được vào lệnh</li>
          <li>R:R lý tưởng: <strong>1:2</strong> trở lên</li>
          <li>Nếu SL quá rộng mà TP không đạt 1.5R → <strong>bỏ qua tín hiệu</strong></li>
        </ul>
      </div>
      <div style={S.tipBox}>
        <strong>💡 Mẹo nâng cao:</strong> Khi giá chạm TP1, kéo SL về entry (breakeven) cho phần còn lại. Như vậy bạn đã "free trade" — không thể thua được nữa.
      </div>
      <div style={{marginTop:'16px',padding:'12px',background:'#1e293b40',borderRadius:'8px',border:'1px dashed #64748b'}}>
        <p style={{color:'#94a3b8',fontSize:'0.82rem',margin:0}}>📝 <em>Phần này sẽ được cập nhật thêm kiến thức chi tiết về quản lý vốn, position sizing và trailing stop trong tương lai.</em></p>
      </div>
    </article>
  );
}

// ============================================================
// STYLES
// ============================================================
const S: Record<string, React.CSSProperties> = {
  container: { height: '100vh', display: 'flex', flexDirection: 'column', background: '#060d1a', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', gap: '16px', padding: '10px 20px', background: '#0a1628', borderBottom: '1px solid #1e2d4a', flexShrink: 0 },
  backBtn: { background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 },
  title: { margin: 0, fontSize: '1.2rem', color: '#fbbf24', fontWeight: 800 },
  subtitle: { color: '#64748b', fontSize: '0.82rem' },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  sidebar: { width: '240px', background: '#0a1628', borderRight: '1px solid #1e2d4a', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto', flexShrink: 0 },
  navItem: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'transparent', border: '1px solid transparent', borderRadius: '8px', color: '#94a3b8', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, textAlign: 'left', width: '100%' },
  navItemActive: { background: '#1e293b', borderColor: '#334155', color: '#fbbf24' },
  main: { flex: 1, overflow: 'auto', padding: '20px 28px' },
  article: { maxWidth: '800px' },
  h3: { color: '#fbbf24', fontSize: '1.2rem', margin: '0 0 14px', fontWeight: 700 },
  h4: { color: '#fbbf24', fontSize: '0.92rem', margin: '0 0 8px', fontWeight: 700 },
  p: { fontSize: '0.88rem', lineHeight: '1.7', color: '#cbd5e1', margin: '0 0 12px' },
  quote: { fontStyle: 'italic', color: '#94a3b8', borderLeft: '3px solid #fbbf24', paddingLeft: '14px', margin: '14px 0', lineHeight: '1.6', fontSize: '0.88rem' },
  ul: { paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem', lineHeight: '1.6', color: '#cbd5e1' },
  ruleBox: { background: '#0f172a', border: '1px solid #1e2d4a', borderRadius: '10px', padding: '14px 16px', margin: '14px 0' },
  infoBox: { background: '#0f172a', border: '1px solid #1e2d4a', borderRadius: '10px', padding: '14px 16px', margin: '14px 0' },
  tipBox: { background: 'rgba(59,130,246,0.08)', border: '1px solid #3b82f640', borderRadius: '8px', padding: '12px 14px', margin: '14px 0', fontSize: '0.85rem', color: '#93c5fd', lineHeight: '1.6' },
  warningBox: { background: 'rgba(239,68,68,0.06)', border: '1px solid #ef444430', borderRadius: '8px', padding: '12px 14px', margin: '14px 0', fontSize: '0.85rem', color: '#fca5a5', lineHeight: '1.6' },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px', marginTop: '8px' },
  miniCard: { background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '10px', fontSize: '0.82rem', lineHeight: '1.5', color: '#e2e8f0' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', marginTop: '8px' },
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #334155', color: '#94a3b8', fontWeight: 600 },
  td: { padding: '6px 8px', borderBottom: '1px solid #1e2d4a20', color: '#cbd5e1' },
};
