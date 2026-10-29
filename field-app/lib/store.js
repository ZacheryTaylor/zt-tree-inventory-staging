/* IndexedDB wrapper (v2): stores 'jobs', 'trees' (jobId), 'photos' (by tree id), 'checks' (accuracy checks, jobId).
 * Settings live in localStorage. DB name kept from v0.x so existing field data carries over (migrated into a job). */
(function () {
  const DB = 'zt-tree-survey', VER = 2;
  let dbp;
  function db() {
    return dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, VER);
      r.onupgradeneeded = () => {
        const d = r.result, tx = r.transaction;
        if (!d.objectStoreNames.contains('trees')) d.createObjectStore('trees', { keyPath: 'id', autoIncrement: true });
        if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('jobs')) d.createObjectStore('jobs', { keyPath: 'id', autoIncrement: true });
        if (!d.objectStoreNames.contains('checks')) d.createObjectStore('checks', { keyPath: 'id', autoIncrement: true });
        const ts = tx.objectStore('trees'); if (!ts.indexNames.contains('jobId')) ts.createIndex('jobId', 'jobId');
        const cs = tx.objectStore('checks'); if (!cs.indexNames.contains('jobId')) cs.createIndex('jobId', 'jobId');
      };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
  }
  function tx(store, mode, fn) {
    return db().then(d => new Promise((res, rej) => {
      const t = d.transaction(store, mode), s = t.objectStore(store); let out;
      Promise.resolve(fn(s)).then(v => { out = v; });
      t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error);
    }));
  }
  const byJob = (store, jobId) => tx(store, 'readonly', s => s.index('jobId').getAll(jobId));
  self.TSStore = {
    all: () => tx('trees', 'readonly', s => s.getAll()),
    treesFor: jobId => byJob('trees', jobId),
    put: t => tx('trees', 'readwrite', s => s.put(t)),
    get: id => tx('trees', 'readonly', s => s.get(id)),
    del: id => tx('trees', 'readwrite', s => s.delete(id)),
    clear: () => Promise.all(['trees', 'photos', 'jobs', 'checks'].map(n => tx(n, 'readwrite', s => s.clear()))),
    putPhoto: (id, blob) => tx('photos', 'readwrite', s => s.put({ id, blob })),
    getPhoto: id => tx('photos', 'readonly', s => s.get(id)),
    delPhoto: id => tx('photos', 'readwrite', s => s.delete(id)),
    jobs: () => tx('jobs', 'readonly', s => s.getAll()),
    getJob: id => tx('jobs', 'readonly', s => s.get(id)),
    putJob: j => tx('jobs', 'readwrite', s => s.put(j)),
    delJob: id => tx('jobs', 'readwrite', s => s.delete(id)),
    checksFor: jobId => byJob('checks', jobId),
    putCheck: c => tx('checks', 'readwrite', s => s.put(c)),
    delCheck: id => tx('checks', 'readwrite', s => s.delete(id)),
    settings: { get: k => { try { return JSON.parse(localStorage.getItem('zts:' + k)); } catch (e) { return null; } },
      set: (k, v) => localStorage.setItem('zts:' + k, JSON.stringify(v)) },
  };
})();
