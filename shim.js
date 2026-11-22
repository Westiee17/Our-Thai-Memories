// Lets the scrapbook run on GitHub Pages, using Supabase for shared photos & data.
(() => {
  const C = window.TRIP_CONFIG || {};
  if (!C.url || !C.key || C.url.includes('YOUR-PROJECT') || C.key.includes('YOUR-')) {
    document.addEventListener('DOMContentLoaded', () => {
      const d = document.createElement('div');
      d.style.cssText = 'background:#fff1c4;color:#4a3b52;padding:10px 14px;text-align:center;font:14px sans-serif';
      d.textContent = '⚠️ Supabase isn’t connected yet — put your Project URL and anon key in config.js, then refresh.';
      document.body.prepend(d);
    });
  }
  const H = C.key && C.key.startsWith('eyJ') ? { apikey: C.key, Authorization: 'Bearer ' + C.key } : { apikey: C.key };
  const R = C.url + '/rest/v1/docs';
  const J = async (m, u, b, x) => {
    const r = await fetch(u, { method: m, headers: { ...H, 'Content-Type': 'application/json', ...x }, body: b ? JSON.stringify(b) : undefined });
    if (!r.ok) { let t = ''; try { const j = await r.json(); t = j.message || j.hint || ''; } catch (e) {} throw new Error(r.status + ' ' + t); }
    return r;
  };
  const q = c => `?coll=eq.${encodeURIComponent(c)}&select=id,data`;
  const ping = () => window.dispatchEvent(new Event('trip-write'));
  window.blobUrl = p => C.url + '/storage/v1/object/public/media/' + p;

  function collection(c) {
    return {
      doc(id) {
        const o = {
          async set(d) { await J('POST', R + '?on_conflict=coll,id', { coll: c, id, data: d }, { Prefer: 'resolution=merge-duplicates' }); ping(); },
          async update(d) {
            const r = await (await J('GET', R + q(c) + '&id=eq.' + encodeURIComponent(id))).json();
            await o.set({ ...(r[0] ? r[0].data : {}), ...d });
          },
          async delete() { await J('DELETE', R + `?coll=eq.${encodeURIComponent(c)}&id=eq.${encodeURIComponent(id)}`); ping(); }
        };
        return o;
      },
      onSnapshot(next, err) {
        let last = '';
        const tick = async () => {
          try {
            const r = await (await J('GET', R + q(c))).json();
            const s = JSON.stringify(r);
            if (s !== last) { last = s; next({ docs: r.map(x => ({ id: x.id, data: () => x.data })) }); }
          } catch (e) { err && err(e); }
        };
        tick(); setInterval(tick, 4000); window.addEventListener('trip-write', tick);
        return () => {};
      }
    };
  }

  // Shrinks big photos (max 1920px, JPEG) so the free 1 GB storage holds far more.
  async function shrink(f) {
    if (!f.type.startsWith('image/') || /gif|svg/.test(f.type) || f.size < 400 * 1024) return f;
    try {
      const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
      const k = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
      if (b && b.size < f.size) return new File([b], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch (e) {}
    return f;
  }

  const assets = {
    async upload(f) {
      f = await shrink(f);
      const ext = (f.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
      const p = Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + '.' + ext;
      const r = await fetch(C.url + '/storage/v1/object/media/' + p, { method: 'POST', headers: { ...H, 'Content-Type': f.type || 'application/octet-stream' }, body: f });
      if (!r.ok) throw new Error('upload failed');
      return { id: p, url: window.blobUrl(p) };
    }
  };

  let uid = localStorage.getItem('trip_uid');
  if (!uid) { uid = 'u' + Math.random().toString(36).slice(2, 10); localStorage.setItem('trip_uid', uid); }
  const user = {
    async id() {
      let n = localStorage.getItem('trip_name');
      if (!n) {
        n = (prompt('What’s your name? (shown under your photos)') || 'Traveller').trim().slice(0, 20);
        localStorage.setItem('trip_name', n);
      }
      await collection('people').doc(uid).set({ name: n });
      return uid;
    },
    async profiles() {
      const r = await (await J('GET', R + q('people'))).json();
      const m = {}; r.forEach(x => { m[x.id] = { name: x.data.name }; });
      return m;
    }
  };

  const downloads = {
    async save({ filename, data }) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(data); a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      return { status: 'saved' };
    }
  };

  window.claude = { use: async n => ({ db: { collection }, assets, user, downloads })[n] || null };
})();
