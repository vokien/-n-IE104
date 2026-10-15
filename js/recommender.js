/**
 * =============================================================
 * RECOMMENDER.JS - Động cơ Khuyến nghị Học thuật (TV2)
 * Đồ án IE104 - Internet và Công nghệ Web
 *
 * Thuật toán: Okapi BM25 (Vanilla JS thuần)
 * Không dùng bất kỳ thư viện ngoài nào.
 *
 * Pipeline:
 *   Bước 1 → Tiền xử lý văn bản (Tokenize, Lowercase, Normalize)
 *   Bước 2 → Lọc từ dừng học thuật (Stopword Filtering)
 *   Bước 3 → Tính điểm Okapi BM25 giữa query và mỗi venue
 *   Bước 4 → Xếp hạng & trả về Top-K kết quả kèm matched keywords
 * =============================================================
 */

/* ==============================================================
   BƯỚC 2: DANH SÁCH TỪ DỪNG (STOPWORDS)
   ~150 từ tiếng Anh thông dụng + từ dừng học thuật chuyên ngành
   ============================================================== */
const STOPWORDS = new Set([
  // Từ phổ thông và học thuật; giữ data, model, algorithm và thuật ngữ chuyên môn.
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to",
  "for", "of", "with", "by", "from", "is", "are", "was", "were", "be",
  "been", "being", "have", "has", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "shall", "can", "this", "that", "these", "those",
  "i", "me", "my", "we", "our", "you", "your", "he", "him", "his",
  "she", "her", "it", "its", "they", "them", "their", "what", "which", "who",
  "whom", "when", "where", "why", "how", "all", "both", "each", "few", "more",
  "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same",
  "so", "than", "too", "very", "just", "because", "as", "until", "while", "if",
  "then", "there", "here", "about", "above", "after", "before", "between", "into", "through",
  "during", "also", "again", "further", "once", "over", "under", "up", "down", "out",
  "off", "any", "many", "much", "among", "within", "without", "whether", "although", "however",
  "therefore", "thus", "hence", "since", "despite", "per", "via", "upon", "paper", "papers",
  "study", "studies", "propose", "proposed", "proposes", "present", "presented", "presents", "describe", "described",
  "describes", "demonstrate", "demonstrated", "show", "shows", "shown", "discuss", "discussed", "investigate", "investigated",
  "using", "used", "use", "based", "result", "results", "conclusion", "conclusions"
]);

/* ==============================================================
   BƯỚC 1: TIỀN XỬ LÝ VĂN BẢN (TEXT PREPROCESSING)
   ============================================================== */

/**
 * tokenize(text) → string[]
 *
 * Chuyển đoạn văn bản thô → mảng các token đã chuẩn hóa.
 * Xử lý:
 *   1. Chuyển về chữ thường (lowercase)
 *   2. Loại bỏ ký tự đặc biệt, tách dấu gạch ngang thành khoảng trắng
 *   3. Tách theo khoảng trắng
 *   4. Loại bỏ token rỗng và token quá ngắn (< 2 ký tự)
 *
 * @param {string} text - Văn bản đầu vào
 * @returns {string[]} Mảng token
 */
function tokenize(text) {
  if (!text || typeof text !== "string") return [];

  return text
    .toLowerCase()
    .normalize("NFC")
    // Giữ chữ Unicode (kể cả tiếng Việt); stopwords hiện dành cho tiếng Anh.
    .replace(/[^\p{L}\p{M}0-9\s]/gu, " ")
    // Chuẩn hóa khoảng trắng
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    // Lọc token quá ngắn hoặc là số thuần túy
    .filter(token => token.length >= 2 && !/^\d+$/.test(token));
}

/**
 * removeStopwords(tokens) → string[]
 *
 * Lọc bỏ các từ dừng khỏi mảng token.
 * Giữ lại các từ không nằm trong STOPWORDS.
 *
 * @param {string[]} tokens - Mảng token đầu vào
 * @returns {string[]} Mảng token đã lọc
 */
function removeStopwords(tokens) {
  return tokens.filter(token => !STOPWORDS.has(token));
}

/**
 * preprocessText(text) → string[]
 *
 * Pipeline tiền xử lý đầy đủ: Tokenize → RemoveStopwords
 * Kết quả là danh sách các từ có nghĩa, sẵn sàng cho BM25.
 *
 * @param {string} text - Văn bản đầu vào thô
 * @returns {string[]} Mảng token đã tiền xử lý
 */
function preprocessText(text) {
  const tokens = tokenize(text);
  return removeStopwords(tokens);
}

/**
 * buildTermFrequency(tokens) → Map<string, number>
 *
 * Tính tần suất xuất hiện (TF raw count) của từng token.
 * Trả về Map: { token → số lần xuất hiện }
 *
 * @param {string[]} tokens
 * @returns {Map<string, number>}
 */
function buildTermFrequency(tokens) {
  const tf = new Map();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  return tf;
}

/* ==============================================================
   BƯỚC 3: THUẬT TOÁN OKAPI BM25
   Công thức:
     score(q, d) = Σ_{t∈q} IDF(t) × [ TF(t,d) × (k1+1) ]
                                        / [ TF(t,d) + k1×(1 - b + b×|d|/avgdl) ]
   Trong đó:
     - TF(t,d): Tần suất từ t trong tài liệu d
     - IDF(t): log( (N - df(t) + 0.5) / (df(t) + 0.5) + 1 )  [Robertson IDF]
     - |d|: Độ dài tài liệu (số token sau tiền xử lý)
     - avgdl: Độ dài trung bình corpus
     - k1: Hệ số TF saturation (mặc định 1.2)
     - b: Hệ số chuẩn hóa độ dài (mặc định 0.75)
   ============================================================== */

const BM25_K1 = 1.2;  // Kiểm soát mức độ bão hòa của TF
const BM25_B  = 0.75; // Kiểm soát mức độ chuẩn hóa theo độ dài tài liệu

/**
 * BM25Engine
 *
 * Class đóng gói toàn bộ logic BM25.
 * Khởi tạo với corpus (mảng venue), tự động build IDF index.
 */
class BM25Engine {
  /**
   * @param {Object[]} venues - Mảng các venue từ venues.json
   */
  constructor(venues) {
    this.venues = venues;
    this.N = venues.length; // Tổng số tài liệu trong corpus

    // Hỗ trợ cả đoạn scope mẫu độc lập và dữ liệu venues.json hiện tại.
    this.docs = venues.map(venue => {
      const venueText = [
        venue.scope || "",
        (venue.scope_keywords || []).join(" "),
        venue.name || "",
        venue.acronym || "",
        (venue.subject_area || []).join(" ")
      ].join(" ");
      return preprocessText(venueText);
    });

    // Tính độ dài trung bình tài liệu (avgdl)
    const totalLen = this.docs.reduce((sum, doc) => sum + doc.length, 0);
    this.avgdl = this.N > 0 && totalLen > 0 ? totalLen / this.N : 1;
    this.termFrequencies = this.docs.map(buildTermFrequency);

    // Build IDF table: df(t) = số tài liệu chứa từ t
    this.idfTable = this._buildIDF();
  }

  /**
   * _buildIDF() → Map<string, number>
   *
   * Tính IDF theo công thức Robertson (BM25 chuẩn):
   *   IDF(t) = log( (N - df(t) + 0.5) / (df(t) + 0.5) + 1 )
   *
   * Giá trị IDF luôn dương nhờ +1 (tránh IDF âm khi df lớn).
   */
  _buildIDF() {
    // Bước 1: đếm df (document frequency) cho mỗi term
    const df = new Map();
    for (const docTokens of this.docs) {
      // Dùng Set để đếm mỗi term tối đa 1 lần/tài liệu
      const seen = new Set(docTokens);
      for (const term of seen) {
        df.set(term, (df.get(term) || 0) + 1);
      }
    }

    // Bước 2: tính IDF cho mỗi term
    const idf = new Map();
    for (const [term, docFreq] of df.entries()) {
      const score = Math.log(
        (this.N - docFreq + 0.5) / (docFreq + 0.5) + 1
      );
      idf.set(term, score);
    }
    return idf;
  }

  /**
   * _bm25Score(queryTokens, docIndex) → number
   *
   * Tính điểm BM25 của một venue cụ thể với query.
   *
   * @param {string[]} queryTokens - Mảng token của query đã tiền xử lý
   * @param {number}   docIndex    - Chỉ số venue trong this.docs
   * @returns {number} Điểm BM25 (không âm)
   */
  _bm25Score(queryTokens, docIndex) {
    const docTokens = this.docs[docIndex];
    const docLen = docTokens.length;
    const tf = this.termFrequencies[docIndex];

    let score = 0;
    for (const term of queryTokens) {
      const termTF = tf.get(term) || 0;
      if (termTF === 0) continue; // Term không xuất hiện trong doc này

      const idf = this.idfTable.get(term) || 0;

      // Công thức BM25 cốt lõi
      const numerator   = termTF * (BM25_K1 + 1);
      const denominator = termTF + BM25_K1 * (1 - BM25_B + BM25_B * docLen / this.avgdl);

      score += idf * (numerator / denominator);
    }
    return score;
  }

  /**
   * _getMatchedKeywords(queryTokens, docIndex) → string[]
   *
   * Trả về các token thực sự xuất hiện trong cả query và tài liệu đã lập chỉ mục.
   * Dùng để hiển thị "căn cứ gợi ý" trên giao diện.
   *
   * @param {string[]} queryTokens
   * @param {number}   docIndex
   * @returns {string[]}
   */
  _getMatchedKeywords(queryTokens, docIndex) {
    const tf = this.termFrequencies[docIndex];
    return [...new Set(queryTokens)].filter(term => tf.has(term));
  }

  /**
   * search(query, options) → Object[]
   *
   * API chính: Nhận văn bản query, trả về Top-K venue được gợi ý.
   *
   * @param {string} query   - Văn bản đầu vào (title + abstract + keywords)
   * @param {Object} options - Tuỳ chọn lọc
   *   @param {number}  options.topK       - Số lượng kết quả trả về (mặc định 10)
   *   @param {string}  options.typeFilter - "conference" | "journal" | "all"
   *   @param {string}  options.minRank    - "Q1" | "Q2" | "A*" | "A" | "any"
   * @returns {Object} { results, tokenCount, totalSearched, error }
   * results chứa { venue, bm25Score, matchScore, matchedKeywords, matchLevel }.
   * matchScore là điểm tương đối trong tập kết quả, không phải xác suất phù hợp.
   */
  search(query, options = {}) {
    const {
      topK       = 10,
      typeFilter = "all",
      minRank    = "any"
    } = options;

    // Bước 1: Tiền xử lý query
    const queryTokens = [...new Set(preprocessText(query))];
    if (queryTokens.length === 0) {
      return { results: [], tokenCount: 0, totalSearched: this.N, error: "Văn bản query quá ngắn hoặc chỉ chứa từ dừng." };
    }

    // Bước 2: Tính điểm BM25 cho từng venue
    let scored = this.venues.map((venue, idx) => {
      const rawScore = this._bm25Score(queryTokens, idx);
      const matched  = this._getMatchedKeywords(queryTokens, idx);
      return { venue, rawScore, matchedKeywords: matched, docIndex: idx };
    });

    // Bước 3: Áp dụng bộ lọc (loại hình + xếp hạng)
    scored = scored.filter(({ venue, rawScore }) => {
      if (rawScore <= 0) return false;
      // Lọc theo loại hình
      if (typeFilter !== "all" && venue.type !== typeFilter) return false;

      // Lọc theo xếp hạng tối thiểu
      if (minRank !== "any") {
        const rankOrder = { "Q1": 1, "Q2": 2, "Q3": 3, "Q4": 4 };
        const coreOrder = { "A*": 1, "A": 2, "B": 3, "C": 4 };

        if (["Q1","Q2","Q3","Q4"].includes(minRank)) {
          const venueRank = rankOrder[venue.scopus_rank] || 99;
          const reqRank   = rankOrder[minRank];
          return venueRank <= reqRank;
        }
        if (["A*","A","B","C"].includes(minRank)) {
          const venueRank = coreOrder[venue.core_rank] || 99;
          const reqRank   = coreOrder[minRank];
          return venueRank <= reqRank;
        }
      }
      return true;
    });

    // Bước 4: Sắp xếp giảm dần theo BM25 score
    scored.sort((a, b) => b.rawScore - a.rawScore);

    // Bước 5: Chuẩn hóa điểm về thang 0–100% (so với điểm cao nhất)
    const maxScore = scored.length > 0 ? scored[0].rawScore : 1;
    const results = scored.slice(0, topK).map(item => {
      const pct = maxScore > 0 ? Math.round((item.rawScore / maxScore) * 100) : 0;
      let level = "low";
      if (pct >= 80) level = "high";
      else if (pct >= 45) level = "medium";

      return {
        venue:           item.venue,
        bm25Score:       item.rawScore,
        matchScore:      pct,       // Phần trăm 0–100
        matchedKeywords: item.matchedKeywords,
        matchLevel:      level      // "high" | "medium" | "low"
      };
    });

    return {
      results,
      tokenCount:    queryTokens.length,
      totalSearched: this.venues.length,
      error:         null
    };
  }
}

/** Corpus tự tạo: không cần fetch, DOM hay dữ liệu của thành viên khác. */
const MOCK_SCOPE_CORPUS = [
  {
    id: "mock-ai",
    scope: "Research on machine learning, neural networks and computer vision. Topics include deep learning for image recognition and natural language processing."
  },
  {
    id: "mock-security",
    scope: "Research on cybersecurity, cryptography and network security. Topics include intrusion detection, privacy protection and secure communication."
  },
  {
    id: "mock-database",
    scope: "Research on databases, data mining and information retrieval. Topics include query optimization, distributed storage and transaction management."
  }
];

/**
 * Browser Console: runRecommenderTests()
 * Terminal: node js/recommender.js (từ thư mục dự án).
 * Đo build index + search; không tính log, fetch hoặc render giao diện.
 * Ném lỗi nếu kiểm thử hoặc ngưỡng thời gian không đạt.
 */
function runRecommenderTests() {
  let passed = 0;
  function check(condition, message) {
    if (!condition) throw new Error(`[FAIL] ${message}`);
    passed++;
    console.log(`[PASS] ${message}`);
  }
  const sample = "This PAPER proposes DATA mining, machine-learning!!! 2026 ---";
  const tokens = preprocessText(sample);
  console.log("Tiền xử lý:", sample, "=>", tokens);
  console.log("Stopwords:", STOPWORDS.size, "k1:", BM25_K1, "b:", BM25_B);
  check(STOPWORDS.size >= 140 && STOPWORDS.size <= 160, "Khoảng 150 stopwords duy nhất");
  check(JSON.stringify(tokens) === JSON.stringify(["data", "mining", "machine", "learning"]),
    "Lowercase, tách từ, loại ký tự lạ/số và lọc stopwords");
  check(preprocessText("data model algorithm architecture information").length === 5,
    "Giữ thuật ngữ chuyên môn");
  check(preprocessText(null).length === 0 && preprocessText("the and paper").length === 0,
    "Đầu vào rỗng và toàn stopwords");
  check(tokenize("HỌC máy").join(" ") === "học máy", "Giữ chữ Unicode");

  const start = performance.now();
  const engine = new BM25Engine(MOCK_SCOPE_CORPUS);
  const output = engine.search("machine learning neural networks computer vision");
  const elapsedMs = performance.now() - start;
  console.table(output.results.map(item => ({
    id: item.venue.id,
    bm25Score: item.bm25Score,
    matchScore: item.matchScore,
    matchedKeywords: item.matchedKeywords.join(", ")
  })));
  check(output.results[0]?.venue.id === "mock-ai", "Xếp AI đứng đầu query AI");
  check(engine.search("cryptography network security").results[0]?.venue.id === "mock-security",
    "Xếp security đứng đầu query security");
  check(engine.search("databases query optimization").results[0]?.venue.id === "mock-database",
    "Xếp database đứng đầu query database");
  const ranked = engine.search("research learning cryptography databases").results;
  check(ranked.length === 3 && ranked.every((r, i) => i === 0 || ranked[i - 1].bm25Score >= r.bm25Score),
    "Ba scope được xếp hạng giảm dần");
  check(ranked.every(r => Number.isFinite(r.matchScore) && r.matchScore >= 0 && r.matchScore <= 100),
    "Match Score hữu hạn trong khoảng 0–100%");
  check(engine.search("volcanology").results.length === 0, "Không trả kết quả không trùng từ nào");
  check(engine.search("machine").results[0].matchedKeywords.join() === "machine",
    "Không báo trùng cả cụm machine learning khi chỉ có machine");
  check(engine.search("machine machine").results[0].bm25Score === engine.search("machine").results[0].bm25Score,
    "Không tăng điểm do lặp từ trong query");
  check(new BM25Engine([]).search("learning").results.length === 0 &&
    new BM25Engine([{ scope: "the and" }]).search("learning").results.length === 0,
    "Corpus rỗng hoặc toàn stopwords không gây NaN/lỗi");

  // Ví dụ tính tay: N=2, df=1, tf=2, dl=2, avgdl=1.5.
  const tiny = new BM25Engine([{ scope: "neural neural" }, { scope: "security" }]);
  const expected = Math.log(2) * (2 * 2.2) / (2 + 1.2 * (0.25 + 0.75 * 2 / 1.5));
  check(Math.abs(tiny.search("neural").results[0].bm25Score - expected) < 1e-12,
    "BM25 khớp phép tính tay với k1=1.2, b=0.75");
  const lengths = new BM25Engine([{ id: "short", scope: "neural" }, { id: "long", scope: "neural security privacy storage" }]);
  check(lengths.search("neural").results[0].venue.id === "short", "Chuẩn hóa độ dài tài liệu");
  console.log(`Build index + search (3 scopes): ${elapsedMs.toFixed(3)} ms`);
  check(elapsedMs < 100, "Build index + search dưới 100ms trong lần đo này");
  console.log(`Hoàn tất: ${passed} kiểm thử đạt.`);
  return { passed, elapsedMs, results: output.results };
}

// Export để dùng trong Node.js; chỉ tự chạy test khi gọi trực tiếp file này.
if (typeof module !== "undefined" && module.exports) {
  module.exports = { tokenize, removeStopwords, preprocessText, BM25Engine, MOCK_SCOPE_CORPUS, runRecommenderTests };
  if (typeof require !== "undefined" && require.main === module) runRecommenderTests();
}

/* ==============================================================
   BƯỚC 4: KẾT NỐI VỚI GIAO DIỆN RECOMMEND.HTML
   Xử lý sự kiện form, gọi BM25Engine, render kết quả vào DOM
   ============================================================== */

/** Instance toàn cục của BM25Engine, được khởi tạo sau khi load data */
let recommenderEngine = null;

/**
 * initRecommender()
 *
 * Tải venues.json qua Fetch API và khởi tạo BM25Engine.
 * Được gọi 1 lần khi DOM sẵn sàng.
 */
async function initRecommender() {
  try {
    let res;
    try {
      res = await fetch("../data/venues.json");
      if (!res.ok) throw new Error();
    } catch {
      res = await fetch("./data/venues.json");
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: Không thể tải venues.json`);
    const venues = await res.json();

    recommenderEngine = new BM25Engine(venues);
    console.log(`[Recommender] Đã tải ${venues.length} venues. BM25 Engine sẵn sàng.`);

    // Kích hoạt nút phân tích
    const btn = document.getElementById("btn-analyze");
    if (btn) btn.disabled = false;

  } catch (err) {
    console.error("[Recommender] Lỗi khởi tạo:", err);
    renderError(`Không thể tải cơ sở dữ liệu venues: ${err.message}`);
  }
}

/**
 * getBadgeHTML(venue) → string
 *
 * Tạo HTML các badge xếp hạng (Scopus Quartile + CORE + loại hình)
 * cho một venue.
 */
function getBadgeHTML(venue) {
  const badges = [];

  // Loại hình
  if (venue.type === "conference") {
    badges.push(`<span class="rank-badge rank-badge--conf">🏛️ Hội nghị</span>`);
  } else if (venue.type === "journal") {
    badges.push(`<span class="rank-badge rank-badge--jour">📰 Tạp chí</span>`);
  }

  // Scopus Quartile
  if (venue.scopus_rank) {
    const qClass = `rank-badge--${venue.scopus_rank.toLowerCase()}`;
    badges.push(`<span class="rank-badge ${qClass}">Scopus ${venue.scopus_rank}</span>`);
  }

  // CORE Rank
  if (venue.core_rank) {
    const coreClass = venue.core_rank === "A*" ? "rank-badge--astar"
                    : `rank-badge--${venue.core_rank.toLowerCase()}`;
    badges.push(`<span class="rank-badge ${coreClass}">CORE ${venue.core_rank}</span>`);
  }

  return badges.join("");
}

/**
 * renderResults(searchResult)
 *
 * Render danh sách kết quả BM25 vào #recommend-results-container.
 *
 * @param {{ results: Object[], tokenCount: number, totalSearched: number, error: string }} searchResult
 */
function renderResults(searchResult) {
  const placeholder = document.getElementById("recommend-placeholder");
  const container   = document.getElementById("recommend-results-container");
  if (!container) return;

  // Ẩn placeholder
  if (placeholder) placeholder.style.display = "none";

  // Xử lý lỗi
  if (searchResult.error) {
    renderError(searchResult.error);
    return;
  }

  const { results, tokenCount, totalSearched } = searchResult;
  container.style.display = "block";

  if (results.length === 0) {
    container.innerHTML = `
      <div class="results-empty" role="status">
        <p style="font-size:2rem;">🔍</p>
        <p>Không tìm thấy venue phù hợp với bộ lọc đã chọn.<br>
           Hãy thử mở rộng tiêu chí lọc hoặc nhập thêm từ khóa.</p>
      </div>
    `;
    return;
  }

  // Thanh meta thống kê phân tích
  const metaHTML = `
    <div class="analysis-meta" role="status" aria-live="polite">
      <span>📊 <strong>${tokenCount}</strong> từ có nghĩa được phân tích</span>
      <span>🗄️ Đã so khớp với <strong>${totalSearched}</strong> venues</span>
      <span>✅ Tìm thấy <strong>${results.length}</strong> kết quả phù hợp</span>
    </div>
  `;

  // Render từng thẻ kết quả
  const itemsHTML = results.map((item, idx) => {
    const { venue, matchScore, matchedKeywords, matchLevel } = item;

    // Từ khóa trùng khớp
    const keywordTagsHTML = matchedKeywords.length > 0
      ? matchedKeywords.slice(0, 6).map(kw =>
          `<span class="keyword-tag">${escapeHTML(kw)}</span>`
        ).join("")
      : `<span style="color:var(--color-text-muted);font-size:var(--font-size-xs)">Không có từ khóa trực tiếp trùng khớp</span>`;

    // Link tới trang chủ venue
    const linkHTML = venue.homepage_url
      ? `<a href="${escapeHTML(venue.homepage_url)}" target="_blank" rel="noopener" class="result-link">
           🔗 Trang chủ venue ↗
         </a>`
      : "";

    return `
      <article class="result-item" data-level="${matchLevel}" data-venue-id="${escapeHTML(venue.id || "")}">
        <span class="result-rank" aria-label="Hạng ${idx + 1}">${idx + 1}</span>

        <header class="result-header">
          <div>
            <div class="result-name">${escapeHTML(venue.name || "")}</div>
            <div class="result-acronym">${escapeHTML(venue.acronym || "")}${venue.publisher ? ` · ${escapeHTML(venue.publisher)}` : ""}</div>
          </div>
        </header>

        <div class="result-badges">
          ${getBadgeHTML(venue)}
        </div>

        <div class="match-score-section">
          <div class="match-score-header">
            <span class="match-label" title="Điểm so với kết quả cao nhất trong bộ lọc; không phải xác suất phù hợp.">Match Score BM25 (tương đối)</span>
            <span class="match-percent">${matchScore}%</span>
          </div>
          <div class="match-bar-track" role="progressbar" aria-valuenow="${matchScore}" aria-valuemin="0" aria-valuemax="100" aria-label="Độ tương thích ${matchScore}%">
            <div class="match-bar-fill" style="width: 0%" data-target-width="${matchScore}%"></div>
          </div>
        </div>

        <div class="matched-keywords">
          <span class="matched-keywords__label">🔑 Từ khóa trùng khớp:</span>
          <div class="keyword-tags">${keywordTagsHTML}</div>
        </div>

        ${linkHTML}
      </article>
    `;
  }).join("");

  container.innerHTML = metaHTML + `<div class="result-list">${itemsHTML}</div>`;

  // Animate thanh progress bar sau khi render (requestAnimationFrame)
  requestAnimationFrame(() => {
    const fills = container.querySelectorAll(".match-bar-fill");
    fills.forEach(fill => {
      const target = fill.getAttribute("data-target-width");
      // Double rAF để đảm bảo transition CSS kịch hoạt
      requestAnimationFrame(() => {
        fill.style.width = target;
      });
    });
  });
}

/**
 * renderSkeleton()
 * Hiển thị skeleton loading trong lúc đang tính toán.
 */
function renderSkeleton() {
  const placeholder = document.getElementById("recommend-placeholder");
  const container   = document.getElementById("recommend-results-container");
  if (placeholder) placeholder.style.display = "none";
  if (!container) return;

  container.style.display = "block";
  container.innerHTML = `
    <div class="skeleton-list" aria-label="Đang phân tích..." aria-busy="true">
      <div class="skeleton-item"></div>
      <div class="skeleton-item"></div>
      <div class="skeleton-item"></div>
    </div>
  `;
}

/**
 * renderError(message)
 * Hiển thị thông báo lỗi.
 */
function renderError(message) {
  const container = document.getElementById("recommend-results-container");
  if (!container) return;
  container.style.display = "block";
  container.innerHTML = `
    <div class="results-error" role="alert">
      <span style="font-size:1.2rem">⚠️</span>
      <span>${escapeHTML(message)}</span>
    </div>
  `;
}

/**
 * escapeHTML(str) → string
 * Tránh XSS khi render dữ liệu vào innerHTML.
 */
function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ==============================================================
   KHỞI ĐỘNG SAU KHI DOM SẴN SÀNG
   ============================================================== */
if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", () => {
  // Khởi tạo engine (tải dữ liệu JSON)
  initRecommender();

  const form      = document.getElementById("recommend-form");
  const btnSubmit = document.getElementById("btn-analyze");
  const selType   = document.getElementById("filter-type");
  const selRank   = document.getElementById("filter-rank");
  const selTopK   = document.getElementById("filter-topk");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Kiểm tra engine đã sẵn sàng
    if (!recommenderEngine) {
      renderError("Hệ thống chưa tải xong dữ liệu. Vui lòng thử lại sau vài giây.");
      return;
    }

    // Thu thập đầu vào
    const title    = (document.getElementById("paper-title")?.value || "").trim();
    const abstract = (document.getElementById("paper-abstract")?.value || "").trim();
    const keywords = (document.getElementById("paper-keywords")?.value || "").trim();
    const queryText = [title, abstract, keywords].join(" ").trim();

    if (queryText.length < 20) {
      renderError("Vui lòng nhập ít nhất tiêu đề hoặc tóm tắt bài báo để phân tích (tối thiểu 20 ký tự).");
      return;
    }

    // Lấy giá trị bộ lọc
    const typeFilter = selType?.value  || "all";
    const minRank    = selRank?.value  || "any";
    const topK       = parseInt(selTopK?.value || "10", 10);

    // Hiển thị skeleton và vô hiệu hóa nút
    renderSkeleton();
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.classList.add("loading");
    }

    // Dùng setTimeout để trả quyền điều khiển cho browser render skeleton trước
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      const searchResult = recommenderEngine.search(queryText, { topK, typeFilter, minRank });
      renderResults(searchResult);
    } catch (err) {
      console.error("[Recommender] Lỗi khi tìm kiếm:", err);
      renderError(`Đã xảy ra lỗi khi phân tích: ${err.message}`);
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.classList.remove("loading");
      }
    }
  });
});
