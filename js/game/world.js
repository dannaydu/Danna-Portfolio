/* ============================================================================
 * world.js — Town layout + the real portfolio content
 * ----------------------------------------------------------------------------
 * buildWorld() returns everything the engine needs to render and simulate the
 * town: the ground tile grid, a solid/collision grid, a list of objects to
 * draw (trees, buildings, signs, decorations), and the interactive "points of
 * interest" (POIs) that open a panel of real content when you walk up to them.
 *
 * Tile units throughout (1 tile = 16 native px). Map is MAP_W x MAP_H tiles.
 * ==========================================================================*/

const World = (() => {
  const MAP_W = 40, MAP_H = 28;

  // ---- the four buildings' content (pulled from your real pages) ---------
  const CONTENT = {
    experience: {
      name: 'Experience Hall', icon: '💼', roof: '#c9756b', roofDark: '#a85a52',
      heading: 'Experience',
      blurb: 'Where I have worked, taught, and written.',
      sections: [
        { title: 'App & AI Integration Intern — River of Life Foundation', meta: 'May 2026 – Present · Santa Clara, CA · On-site',
          text: 'App development and AI feature integration.' },
        { title: 'AI Trainer (SWE / Coding) — Handshake', meta: 'Apr 2026 – Present · Remote · Contract',
          text: 'Evaluate and score frontier LLM responses on multi-turn coding tasks against a structured 1–7 rubric, authoring written rationales and preference comparisons to generate high-quality human-feedback data for AI coding assistants.' },
        { title: 'Software Engineering Intern — Legislative Llama', meta: 'Jun 2025 – Aug 2025 · NYC Metro · Remote',
          text: 'Developed bilingual English/Spanish interface features in a React/Next.js civic-tech platform; improved translation and advocacy flows supporting 500+ messages to lawmakers, and prototyped gender-neutral Spanish translations using LLM-assisted workflows.' },
        { title: 'COS 126 Undergraduate Course Assistant — Princeton CS', meta: 'Sep 2024 – Present',
          text: 'Graded assignments and gave constructive feedback to strengthen students\' grasp of foundational CS concepts.' },
        { title: 'Web Development & Design — The Daily Princetonian', meta: 'Sep 2024 – Present',
          text: 'Improved the functionality and aesthetics of the site to better serve the campus community.' },
        { title: 'Staff Data Writer — The Daily Princetonian', meta: 'Sep 2024 – Present',
          text: 'Collected and analyzed data into visualizations and wrote two impactful, data-driven articles.' },
        { title: 'Clubs & Organizations', meta: 'Ongoing',
          text: 'Princeton Latin American Student Association, PSI Fellows Program, Hispanic Scholarship Fund Scholar, QuestBridge Scholar.' },
      ],
      link: { href: 'experience.html', label: 'Open the full Experience page →' },
    },
    projects: {
      name: 'Projects Workshop', icon: '🛠️', roof: '#6b8fc9', roofDark: '#52719f',
      heading: 'Projects',
      blurb: 'Things I have designed and built.',
      sections: [
        { title: 'World Cup 2026: Model vs Market', meta: 'Python · Firebase · ML · Monte Carlo',
          text: 'Probabilistic forecasting platform for the 2026 FIFA World Cup: an ensemble of Elo, Dixon-Coles Poisson, and gradient-boosted models plus 20k–50k Monte Carlo tournament simulations price matches and detect edges against live Kalshi/Polymarket markets, with a paper-trading ledger tracking CLV, ROI, and log-loss (~60% top-pick accuracy). <a href="https://fifa.dannaduarte.com" target="_blank" rel="noopener">fifa.dannaduarte.com →</a>' },
        { title: 'PNI Waitlist Management App', meta: 'Python · React · Flask · PostgreSQL · Render',
          text: 'Full-stack app (built with a team of 5) to streamline Princeton Neuroscience Institute course waitlists and enrollment — role-based access, queue logic, and a responsive React/Tailwind frontend on a Flask + PostgreSQL backend.' },
        { title: 'Hedge Fund Investment Agent', meta: 'Python · LangChain · OpenAI · Streamlit',
          text: 'AI agent that simulates equity investment decisions: integrates live market data (yFinance) with LLM reasoning and function calling, storing analysis, memory, and trade rationales in SQL, served through a Streamlit interface.' },
        { title: 'Roulette Reminders', meta: 'Flutter · Firebase · Material 3',
          text: 'Flutter/Firebase task manager with a casino-style motivation system: authenticated, Firestore-backed todos (due dates, recurring schedules, subtasks, reminders, file attachments) in list/calendar views, where completing tasks earns roulette spins and “House Chips” for deadline-tied bets. <a href="https://roulettereminders.dannaduarte.com" target="_blank" rel="noopener">roulettereminders.dannaduarte.com →</a>' },
        { title: 'AI Investment Agent (Stock Chat)', meta: 'Python · LLM · Gradio',
          text: 'Fetches real-time stock data via yfinance and uses a conversational LLM (Hugging Face) to answer natural-language questions about any ticker, with a ChatGPT-style chat UI.' },
        { title: 'Seam Carving Image Re-sizer', meta: 'Python · Flask · Pillow · NumPy',
          text: 'Full-stack web app for content-aware image resizing — intelligently removes seams to preserve the important parts of an image.' },
        { title: 'Ride-sharing Data Analysis & ML', meta: 'R · tidymodels',
          text: 'Analyzed Chicago ride-share data: spatial analysis (sf), hypothesis testing (infer), LASSO/Ridge regression, and clustering.' },
        { title: 'Avogadro\'s Number Estimator', meta: 'Java · Image Processing',
          text: 'Analyzed video of polystyrene beads in Brownian motion to compute Avogadro\'s number and Boltzmann\'s constant.' },
      ],
      link: { href: 'projects.html', label: 'Open the full Projects page →' },
    },
    skills: {
      name: 'Skills Library', icon: '📚', roof: '#74b07a', roofDark: '#5a9460',
      heading: 'Skills',
      blurb: 'My toolbox.',
      sections: [
        { title: 'Languages', text: 'Java · Python · JavaScript · HTML/CSS · C · R' },
        { title: 'Frameworks', text: 'Flask · React' },
        { title: 'Developer Tools', text: 'GitHub · VSCode · RStudio · IntelliJ · Cursor · Excel' },
        { title: 'Libraries', text: 'pandas · NumPy · Matplotlib · Pillow' },
        { title: 'Spoken Languages', text: 'English (Native) · Spanish (Native) · French (Intermediate)' },
      ],
      link: { href: 'skills.html', label: 'Open the full Skills page →' },
    },
    contact: {
      name: 'Contact Café', icon: '✉️', roof: '#d6a85e', roofDark: '#b88c46',
      heading: 'Get in Touch',
      blurb: 'Let\'s connect!',
      sections: [
        { title: 'Email', text: '<a href="mailto:dd7206@princeton.edu">dd7206@princeton.edu</a>' },
        { title: 'LinkedIn', text: '<a href="https://www.linkedin.com/in/dannaduarte/" target="_blank" rel="noopener">linkedin.com/in/dannaduarte</a>' },
        { title: 'GitHub', text: '<a href="https://github.com/dannaydu" target="_blank" rel="noopener">github.com/dannaydu</a>' },
        { title: 'The Daily Princetonian', text: '<a href="https://www.dailyprincetonian.com/staff/danna-duarte" target="_blank" rel="noopener">My staff page →</a>' },
      ],
      link: { href: 'contact.html', label: 'Open the full Contact page →' },
    },
  };

  // ---- map construction --------------------------------------------------
  function buildWorld() {
    // ground: 'g' grass, 'f' flower-grass, 'p' path, 'w' water, 's' sand
    const ground = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill('g'));
    const solid = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(false));
    const objects = []; // {type, tx, ty}
    const pois = [];     // interactive points

    const inB = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
    const fill = (x0, y0, x1, y1, t) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inB(x, y)) ground[y][x] = t;
    };
    const block = (x0, y0, x1, y1) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inB(x, y)) solid[y][x] = true;
    };

    // scatter some flowers in the grass (stable pattern, not on paths)
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++)
        if (((x * 7 + y * 13) % 11) === 0) ground[y][x] = 'f';

    // pond (top-center-right) with a sandy edge
    fill(22, 1, 27, 5, 'w');
    // sand ring around the pond
    for (let y = 0; y <= 6; y++) for (let x = 21; x <= 28; x++)
      if (inB(x, y) && ground[y][x] !== 'w') ground[y][x] = 's';
    block(22, 1, 27, 5); // water is solid

    // paths: main spine + horizontal street
    fill(19, 6, 20, 25, 'p');   // vertical spine
    fill(6, 13, 33, 14, 'p');   // horizontal street
    // branches up to top buildings
    fill(6, 7, 7, 14, 'p');     // to Experience
    fill(31, 7, 32, 14, 'p');   // to Projects
    // branches down to bottom buildings
    fill(6, 14, 7, 22, 'p');    // to Skills
    fill(31, 14, 32, 22, 'p');  // to Contact

    // ---- buildings (4x4 footprint, drawn from a 64x64 sprite) ----------
    // door sits at the bottom-centre; the tile just below it is the
    // interaction spot (must be on a path).
    function placeBuilding(key, tx, ty, doorX, doorY) {
      const data = CONTENT[key];
      objects.push({ type: 'building', tx, ty, key, roof: data.roof, roofDark: data.roofDark, icon: data.icon, name: data.name });
      block(tx, ty, tx + 3, ty + 3);            // footprint is solid
      pois.push({ id: key, name: data.name, icon: data.icon, ix: doorX, iy: doorY, content: data });
    }
    placeBuilding('experience', 5, 3, 6, 7);
    placeBuilding('projects', 30, 3, 31, 7);
    placeBuilding('skills', 5, 18, 6, 22);
    placeBuilding('contact', 30, 18, 31, 22);

    // ---- welcome sign near spawn --------------------------------------
    objects.push({ type: 'sign', tx: 21, ty: 15 });
    block(21, 15, 21, 15);
    pois.push({
      id: 'welcome', name: 'Welcome', icon: '🌟', ix: 21, iy: 16,
      content: {
        name: "Danna's Town", icon: '🌟', heading: "Welcome to my town!",
        blurb: "Walk around with WASD or the arrow keys.",
        sections: [
          { title: 'How to play', text: 'Press <b>E</b> or <b>Space</b> when the “!” appears over a building to explore it.' },
          { title: 'Your quest', text: 'Visit all four buildings — Experience, Projects, Skills, and Contact — to finish the tour. 🎉' },
        ],
        link: { href: 'index.html', label: '← Back to the classic portfolio' },
      },
    });

    // ---- decoration: tree border + clusters, bushes, lamps -------------
    const tree = (x, y) => { if (inB(x, y) && ground[y][x] === 'g') { objects.push({ type: 'tree', tx: x, ty: y }); block(x, y, x, y); } };
    // border of trees
    for (let x = 0; x < MAP_W; x++) { tree(x, 0); tree(x, MAP_H - 1); }
    for (let y = 0; y < MAP_H; y++) { tree(0, y); tree(MAP_W - 1, y); }
    // a few inner clusters for character (avoid paths/buildings via tree() guard)
    const clusters = [[12, 4], [13, 5], [27, 9], [26, 10], [12, 23], [27, 23], [15, 9], [24, 19], [16, 20], [25, 6]];
    clusters.forEach(([x, y]) => { tree(x, y); });
    // bushes & flower patches dotted around (non-solid)
    const bushes = [[9, 10], [29, 10], [9, 17], [29, 17], [17, 12], [23, 16], [14, 16]];
    bushes.forEach(([x, y]) => { if (inB(x, y) && ground[y][x] === 'g') objects.push({ type: 'bush', tx: x, ty: y }); });
    const patches = [[18, 12], [22, 12], [18, 16], [22, 19], [10, 14], [29, 14]];
    patches.forEach(([x, y]) => { if (inB(x, y) && ground[y][x] !== 'w') objects.push({ type: 'flower', tx: x, ty: y }); });
    // lamps lining the central spine
    [[18, 9], [21, 9], [18, 20], [21, 20]].forEach(([x, y]) => {
      if (inB(x, y)) { objects.push({ type: 'lamp', tx: x, ty: y }); }
    });

    const spawn = { tx: 19, ty: 18 };
    return { w: MAP_W, h: MAP_H, ground, solid, objects, pois, spawn };
  }

  return { MAP_W, MAP_H, buildWorld, CONTENT };
})();
