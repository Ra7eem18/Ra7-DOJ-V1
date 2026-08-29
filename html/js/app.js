// ============================================================
// Ra7-Doj | Frontend Logic (RBAC + i18n + Evidence + Audit + PDF)
// ============================================================

const state = {
    lang: 'en',
    role: 'citizen',
    player: { name: '—', citizenid: '' },
    system: 'Ministry of Justice',
    server: 'VanTown',
    caseTypes: [],
    caseStatuses: [],
    requestStatuses: [],
    evidenceConfig: { MaxImagesPerCase: 30 },
    currentPage: null,
};

const resourceName = (typeof GetParentResourceName === 'function') ? GetParentResourceName() : 'Ra7-Doj';

const STATUS_COLORS = { open: '#c9a84c', in_review: '#e0b84a', judged: '#4ade80', closed: '#8a8a8a' };
const REQUEST_COLORS = { pending: '#c9a84c', approved: '#4ade80', rejected: '#ef4444', scheduled: '#60a5fa' };

// ------------------------------------------------------------
// i18n helpers
// ------------------------------------------------------------
function t(key) {
    const dict = LOCALES[state.lang] || LOCALES.en;
    return dict[key] !== undefined ? dict[key] : (LOCALES.en[key] || key);
}

function applyLangToDom() {
    const dict = LOCALES[state.lang];
    document.getElementById('htmlRoot').setAttribute('dir', dict.dir);
    document.getElementById('htmlRoot').setAttribute('lang', state.lang);
    document.body.style.fontFamily = dict.font;
    document.getElementById('langToggleText').textContent = t('lang_toggle');
}

function toggleLang() {
    state.lang = state.lang === 'en' ? 'ar' : 'en';
    applyLangToDom();
    document.getElementById('userRole').textContent = t('role_' + state.role);
    buildSidebar();
    if (state.currentPage) navigate(state.currentPage);
}

// ------------------------------------------------------------
// NUI <-> server bridge
// ------------------------------------------------------------
async function nuiFetch(event, data = {}) {
    try {
        const res = await fetch(`https://${resourceName}/doj:request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body: JSON.stringify({ event, data }),
        });
        return await res.json();
    } catch (e) {
        console.error('nuiFetch error', e);
        return { ok: false, error: 'network_error' };
    }
}

async function closeNui() {
    await fetch(`https://${resourceName}/doj:close`, { method: 'POST' });
}

// ------------------------------------------------------------
// Toast / Modal
// ------------------------------------------------------------
function toast(titleKey, message = '') {
    const layer = document.getElementById('toastLayer');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<strong>${escapeHtml(t(titleKey))}</strong><span>${escapeHtml(message)}</span>`;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 4200);
}

function errorToast(err) {
    const map = {
        no_permission: 'toast_no_permission',
        invalid_payload: 'toast_fill_required',
        citizen_not_found: 'toast_citizen_not_found',
        already_assigned: 'toast_already_assigned',
        claim_pending: 'toast_claim_already_pending',
        already_handled: 'toast_claim_already_handled',
        invalid_url: 'toast_invalid_url',
        max_images_reached: 'toast_max_images',
    };
    toast('toast_error', t(map[err] || 'toast_load_error'));
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function openModal(html) {
    const layer = document.getElementById('modalLayer');
    layer.innerHTML = `<div class="modal-backdrop" id="modalBackdrop"><div class="modal-box">${html}</div></div>`;
    document.getElementById('modalBackdrop').addEventListener('click', (e) => {
        if (e.target.id === 'modalBackdrop') closeModal();
    });
}
function closeModal() { document.getElementById('modalLayer').innerHTML = ''; }

function badgeCase(value) {
    const color = STATUS_COLORS[value] || '#8a8a8a';
    return `<span class="badge" style="border-color:${color}55; color:${color}; background:${color}18;">${escapeHtml(t('case_status_' + value))}</span>`;
}
function badgeRequest(value) {
    const color = REQUEST_COLORS[value] || '#8a8a8a';
    return `<span class="badge" style="border-color:${color}55; color:${color}; background:${color}18;">${escapeHtml(t('request_status_' + value))}</span>`;
}
function caseTypeLabel(value) { return t('case_type_' + value); }

// ============================================================
// NUI MESSAGE ENTRY
// ============================================================
window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg || !msg.action) return;

    if (msg.action === 'open') {
        state.role = msg.role;
        state.player = msg.player;
        state.system = msg.system;
        state.server = msg.server;
        state.caseTypes = msg.caseTypes || [];
        state.caseStatuses = msg.caseStatuses || [];
        state.requestStatuses = msg.requestStatuses || [];
        state.evidenceConfig = msg.evidenceConfig || state.evidenceConfig;
        state.lang = msg.defaultLocale === 'ar' ? 'ar' : 'en';

        document.getElementById('app').classList.remove('doj-hidden');
        applyLangToDom();
        document.getElementById('brandSystem').textContent = state.system;
        document.getElementById('brandServer').textContent = state.server;
        document.getElementById('userName').textContent = state.player.name;
        document.getElementById('userRole').textContent = t('role_' + state.role);

        buildSidebar();
        navigate(getDefaultPage());
    }

    if (msg.action === 'close') {
        document.getElementById('app').classList.add('doj-hidden');
        closeModal();
    }
});

document.getElementById('closeBtn').addEventListener('click', closeNui);
document.getElementById('langToggle').addEventListener('click', toggleLang);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNui(); });

// ============================================================
// SIDEBAR / NAVIGATION (role-based)
// ============================================================
function isStaff() { return ['lawyer', 'prosecutor', 'judge'].includes(state.role); }

function getStaffNav() {
    const nav = [
        { id: 'staff_dashboard', icon: 'fa-solid fa-gauge', labelKey: 'nav_home' },
        { id: 'staff_cases', icon: 'fa-solid fa-folder-open', labelKey: 'nav_cases' },
        { id: 'staff_search', icon: 'fa-solid fa-magnifying-glass', labelKey: 'nav_search' },
    ];
    if (state.role === 'prosecutor' || state.role === 'judge') {
        nav.push({ id: 'staff_requests', icon: 'fa-solid fa-inbox', labelKey: 'nav_requests' });
    }
    if (state.role === 'judge') {
        nav.push({ id: 'staff_claims', icon: 'fa-solid fa-user-check', labelKey: 'nav_claims' });
        nav.push({ id: 'staff_audit', icon: 'fa-solid fa-clipboard-list', labelKey: 'nav_audit_log' });
    }
    return nav;
}

const CITIZEN_NAV = [
    { id: 'citizen_dashboard', icon: 'fa-solid fa-gauge', labelKey: 'nav_home' },
    { id: 'citizen_cases', icon: 'fa-solid fa-folder-open', labelKey: 'nav_my_cases' },
    { id: 'citizen_new_request', icon: 'fa-solid fa-file-circle-plus', labelKey: 'nav_new_request' },
    { id: 'citizen_requests', icon: 'fa-solid fa-list-check', labelKey: 'nav_my_requests' },
    { id: 'citizen_notifications', icon: 'fa-solid fa-bell', labelKey: 'nav_notifications' },
];

function getDefaultPage() { return isStaff() ? 'staff_dashboard' : 'citizen_dashboard'; }

function buildSidebar() {
    const nav = isStaff() ? getStaffNav() : CITIZEN_NAV;
    const el = document.getElementById('sidebarNav');
    el.innerHTML = nav.map(item => `
        <div class="nav-item" data-page="${item.id}">
            <i class="${item.icon}"></i><span>${escapeHtml(t(item.labelKey))}</span>
        </div>
    `).join('');
    el.querySelectorAll('.nav-item').forEach(node => {
        node.addEventListener('click', () => navigate(node.dataset.page));
    });
}

function setActiveNav(page) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
}

const PAGE_TITLE_KEYS = {
    staff_dashboard: 'nav_home', staff_cases: 'nav_cases', staff_search: 'nav_search',
    staff_requests: 'nav_requests', staff_claims: 'nav_claims', staff_audit: 'nav_audit_log',
    citizen_dashboard: 'nav_home', citizen_cases: 'nav_my_cases', citizen_new_request: 'nav_new_request',
    citizen_requests: 'nav_my_requests', citizen_notifications: 'nav_notifications',
};

function navigate(page) {
    state.currentPage = page;
    setActiveNav(page);
    document.getElementById('pageTitle').textContent = t(PAGE_TITLE_KEYS[page] || 'nav_home');

    const va = viewArea();
    va.classList.remove('entering');
    void va.offsetWidth;
    va.classList.add('entering');

    const router = {
        staff_dashboard: renderStaffDashboard,
        staff_cases: renderStaffCases,
        staff_search: renderStaffSearch,
        staff_requests: renderStaffRequests,
        staff_claims: renderStaffClaims,
        staff_audit: renderStaffAudit,
        citizen_dashboard: renderCitizenDashboard,
        citizen_cases: renderCitizenCases,
        citizen_new_request: renderCitizenNewRequest,
        citizen_requests: renderCitizenRequests,
        citizen_notifications: renderCitizenNotifications,
    };
    (router[page] || (() => {}))();
}

function viewArea() { return document.getElementById('viewArea'); }
function debounce(fn, wait) { let tm; return (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), wait); }; }

// ============================================================
// STAFF: DASHBOARD
// ============================================================
async function renderStaffDashboard() {
    viewArea().innerHTML = loadingBlock();
    const [statsRes, casesRes] = await Promise.all([
        nuiFetch('doj:server:getDashboardStats', {}),
        nuiFetch('doj:server:getCases', { limit: 6 }),
    ]);
    const stats = statsRes.ok ? statsRes.data : { total: 0, active: 0, judged: 0 };
    const cases = casesRes.ok ? casesRes.data : [];

    viewArea().innerHTML = `
        <div class="grid grid-3" style="margin-bottom:20px;">
            ${statCard('fa-solid fa-folder-open', stats.total, t('stat_total_cases'))}
            ${statCard('fa-solid fa-hourglass-half', stats.active, t('stat_active_cases'))}
            ${statCard('fa-solid fa-gavel', stats.judged, t('stat_verdicts'))}
        </div>
        <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                <b>${escapeHtml(t('stat_latest_cases'))}</b>
                ${(state.role === 'prosecutor' || state.role === 'judge') ? `<button class="btn btn-primary btn-sm" id="dashNewCase"><i class="fa-solid fa-plus"></i> ${escapeHtml(t('btn_new_case'))}</button>` : ''}
            </div>
            ${renderCasesTable(cases)}
        </div>
    `;
    const nb = document.getElementById('dashNewCase');
    if (nb) nb.addEventListener('click', openCreateCaseModal);
    bindCaseRows(cases);
}

function statCard(icon, value, label) {
    return `<div class="card stat-card"><div class="stat-icon"><i class="${icon}"></i></div><div><div class="stat-value">${value}</div><div class="stat-label">${escapeHtml(label)}</div></div></div>`;
}
function loadingBlock() { return `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><span>${escapeHtml(t('loading'))}</span></div>`; }

function renderCasesTable(cases) {
    if (!cases.length) return `<div class="empty-state"><i class="fa-solid fa-inbox"></i><span>${escapeHtml(t('empty_no_cases'))}</span></div>`;
    return `
        <div class="table-wrap">
            <table>
                <thead><tr>
                    <th>${t('table_case_number')}</th><th>${t('table_title')}</th><th>${t('table_citizen')}</th>
                    <th>${t('table_type')}</th><th>${t('table_status')}</th><th>${t('table_date')}</th>
                </tr></thead>
                <tbody>
                    ${cases.map(c => `
                        <tr data-id="${c.id}">
                            <td>${escapeHtml(c.case_number)}</td>
                            <td>${escapeHtml(c.title)}</td>
                            <td>${escapeHtml(c.citizen_name)}</td>
                            <td>${escapeHtml(caseTypeLabel(c.type))}</td>
                            <td>${badgeCase(c.status)}</td>
                            <td>${escapeHtml(c.created_at)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}
function bindCaseRows() {
    document.querySelectorAll('tbody tr[data-id]').forEach(row => {
        row.addEventListener('click', () => openCaseDetail(parseInt(row.dataset.id)));
    });
}

// ============================================================
// STAFF: CASES LIST
// ============================================================
async function renderStaffCases() {
    viewArea().innerHTML = `
        <div class="toolbar">
            <input class="input" id="caseSearch" placeholder="${escapeHtml(t('field_search'))}" style="min-width:280px;">
            <select class="input" id="caseStatusFilter">
                <option value="all">${escapeHtml(t('table_status'))}</option>
                ${state.caseStatuses.map(s => `<option value="${s}">${escapeHtml(t('case_status_' + s))}</option>`).join('')}
            </select>
            <select class="input" id="caseTypeFilter">
                <option value="all">${escapeHtml(t('table_type'))}</option>
                ${state.caseTypes.map(ty => `<option value="${ty}">${escapeHtml(t('case_type_' + ty))}</option>`).join('')}
            </select>
            ${(state.role === 'prosecutor' || state.role === 'judge') ? `<button class="btn btn-primary" id="newCaseBtn" style="margin-inline-start:auto;"><i class="fa-solid fa-plus"></i> ${escapeHtml(t('btn_new_case'))}</button>` : ''}
        </div>
        <div id="casesResult" class="card">${loadingBlock()}</div>
    `;

    const nb = document.getElementById('newCaseBtn');
    if (nb) nb.addEventListener('click', openCreateCaseModal);

    const doSearch = async () => {
        const search = document.getElementById('caseSearch').value;
        const status = document.getElementById('caseStatusFilter').value;
        const type = document.getElementById('caseTypeFilter').value;
        const res = await nuiFetch('doj:server:getCases', { search, status, type });
        const cases = res.ok ? res.data : [];
        document.getElementById('casesResult').innerHTML = renderCasesTable(cases);
        bindCaseRows(cases);
    };

    document.getElementById('caseSearch').addEventListener('input', debounce(doSearch, 350));
    document.getElementById('caseStatusFilter').addEventListener('change', doSearch);
    document.getElementById('caseTypeFilter').addEventListener('change', doSearch);
    doSearch();
}

// ============================================================
// CREATE CASE MODAL (prosecutor / judge)
// ============================================================
function openCreateCaseModal(prefillCitizen, prefillTitle, prefillDescription, linkedRequestId) {
    openModal(`
        <h2><i class="fa-solid fa-folder-plus"></i> ${escapeHtml(t('modal_new_case'))}</h2>
        <div class="field"><label>${escapeHtml(t('field_citizen_id'))}</label><input class="input" id="mCitizenId" value="${prefillCitizen ? escapeHtml(prefillCitizen) : ''}"></div>
        <div class="field"><label>${escapeHtml(t('field_case_type'))}</label>
            <select class="input" id="mType">${state.caseTypes.map(ty => `<option value="${ty}">${escapeHtml(t('case_type_' + ty))}</option>`).join('')}</select>
        </div>
        <div class="field"><label>${escapeHtml(t('field_case_title'))}</label><input class="input" id="mTitle" value="${prefillTitle ? escapeHtml(prefillTitle) : ''}"></div>
        <div class="field"><label>${escapeHtml(t('field_description'))}</label><textarea class="input" id="mDesc">${prefillDescription ? escapeHtml(prefillDescription) : ''}</textarea></div>
        <div class="field"><label>${escapeHtml(t('field_charges'))}</label><input class="input" id="mCharges"></div>
        <div class="modal-actions">
            <button class="btn" id="mCancel">${escapeHtml(t('btn_cancel'))}</button>
            <button class="btn btn-primary" id="mSave"><i class="fa-solid fa-check"></i> ${escapeHtml(t('btn_new_case'))}</button>
        </div>
    `);

    document.getElementById('mCancel').addEventListener('click', closeModal);
    document.getElementById('mSave').addEventListener('click', async () => {
        const citizen_citizenid = document.getElementById('mCitizenId').value.trim();
        const type = document.getElementById('mType').value;
        const title = document.getElementById('mTitle').value.trim();
        const description = document.getElementById('mDesc').value.trim();
        const charges = document.getElementById('mCharges').value.split(',').map(s => s.trim()).filter(Boolean);

        if (!citizen_citizenid || !title) { toast('toast_error', t('toast_fill_required')); return; }

        const payload = { citizen_citizenid, type, title, description, charges };
        if (linkedRequestId) payload.linked_request_id = linkedRequestId;

        const res = await nuiFetch('doj:server:createCase', payload);
        if (res.ok) {
            toast('toast_success', `${t('toast_case_created')}: ${res.data.case_number}`);
            closeModal();
            navigate(state.currentPage);
        } else {
            errorToast(res.error);
        }
    });
}

// ============================================================
// CASE DETAIL MODAL (staff)
// ============================================================
async function openCaseDetail(caseId) {
    const res = await nuiFetch('doj:server:getCaseById', caseId);
    if (!res.ok) { errorToast(res.error); return; }
    const c = res.data;

    const canEdit = (state.role === 'prosecutor' && c.prosecutor_citizenid === state.player.citizenid) || state.role === 'judge';
    const canVerdict = state.role === 'judge' && c.status !== 'judged';

    const canClaimLawyer = state.role === 'lawyer' && !c.lawyer_citizenid && !c.my_pending_claim;
    const canClaimProsecutor = state.role === 'prosecutor' && !c.prosecutor_citizenid && !c.my_pending_claim;
    const showPendingClaim = c.my_pending_claim;

    openModal(`
        <h2><i class="fa-solid fa-folder-open"></i> ${escapeHtml(c.case_number)}</h2>

        <div class="field"><label>${escapeHtml(t('field_case_title'))}</label><input class="input" id="dTitle" value="${escapeHtml(c.title)}" ${canEdit ? '' : 'disabled'}></div>
        <div class="field"><label>${escapeHtml(t('field_description'))}</label><textarea class="input" id="dDesc" ${canEdit ? '' : 'disabled'}>${escapeHtml(c.description || '')}</textarea></div>
        <div class="field"><label>${escapeHtml(t('table_citizen'))}</label><input class="input" value="${escapeHtml(c.citizen_name)} (${escapeHtml(c.citizen_citizenid)})" disabled></div>

        <div class="grid grid-2">
            <div class="field">
                <label>${escapeHtml(t('field_prosecutor'))}</label>
                <input class="input" value="${escapeHtml(c.prosecutor_name || '—')}" disabled>
            </div>
            <div class="field">
                <label>${escapeHtml(t('field_lawyer'))}</label>
                <input class="input" value="${escapeHtml(c.lawyer_name || '—')}" disabled>
            </div>
        </div>

        ${showPendingClaim ? `<div class="field"><span class="badge" style="border-color:var(--gold); color:var(--gold); background:var(--gold-dim);"><i class="fa-solid fa-hourglass-half"></i> ${escapeHtml(t('claim_pending_note'))}</span></div>` : ''}
        ${canClaimLawyer ? `<div class="field"><button class="btn btn-primary" id="dClaimBtn"><i class="fa-solid fa-handshake"></i> ${escapeHtml(t('btn_request_lawyer'))}</button></div>` : ''}
        ${canClaimProsecutor ? `<div class="field"><button class="btn btn-primary" id="dClaimBtn"><i class="fa-solid fa-handshake"></i> ${escapeHtml(t('btn_request_prosecutor'))}</button></div>` : ''}

        <div class="field">
            <label>${escapeHtml(t('field_status'))}</label>
            <select class="input" id="dStatus" ${canEdit ? '' : 'disabled'}>
                ${state.caseStatuses.map(s => `<option value="${s}" ${s === c.status ? 'selected' : ''}>${escapeHtml(t('case_status_' + s))}</option>`).join('')}
            </select>
        </div>

        <div class="field"><label>${escapeHtml(t('field_charges'))}</label><div>${(c.charges || []).map(ch => chipHtml(ch)).join(' ') || '—'}</div></div>

        <div class="field">
            <label>${escapeHtml(t('notes_label'))} (${(c.notes || []).length})</label>
            <div id="notesList">${renderNotes(c.notes)}</div>
            <div style="display:flex; gap:8px; margin-top:8px;">
                <input class="input" id="newNote" placeholder="${escapeHtml(t('field_note'))}" style="flex:1;">
                <button class="btn btn-sm" id="addNoteBtn"><i class="fa-solid fa-plus"></i></button>
            </div>
        </div>

        <div class="field">
            <label>${escapeHtml(t('evidence_label'))} (${(c.evidence || []).length}/${state.evidenceConfig.MaxImagesPerCase})</label>
            <div id="evidenceGallery">${renderEvidenceGallery(c.evidence, c.id, true)}</div>
            <div style="margin-top:8px;">
                <input class="input" id="evidenceUrl" placeholder="${escapeHtml(t('field_image_url'))}" style="margin-bottom:8px; width:100%;">
                <input class="input" id="evidenceCaption" placeholder="${escapeHtml(t('field_caption'))}" style="margin-bottom:8px; width:100%;">
                <button class="btn btn-sm" id="addEvidenceBtn"><i class="fa-solid fa-image"></i> ${escapeHtml(t('btn_add_evidence_url'))}</button>
            </div>
        </div>

        ${canVerdict ? `
        <div class="field">
            <label>${escapeHtml(t('field_verdict'))}</label>
            <textarea class="input" id="verdictText"></textarea>
        </div>` : (c.verdict ? `<div class="field"><label>${escapeHtml(t('field_verdict'))}</label><div class="card">${escapeHtml(c.verdict)}</div></div>` : '')}

        <div class="modal-actions">
            <button class="btn" id="dExport"><i class="fa-solid fa-file-pdf"></i> ${escapeHtml(t('btn_export_pdf'))}</button>
            <button class="btn" id="dCancel">${escapeHtml(t('btn_close'))}</button>
            ${canEdit ? `<button class="btn" id="dSave"><i class="fa-solid fa-floppy-disk"></i> ${escapeHtml(t('btn_save'))}</button>` : ''}
            ${canVerdict ? `<button class="btn btn-primary" id="dVerdict"><i class="fa-solid fa-gavel"></i> ${escapeHtml(t('btn_issue_verdict'))}</button>` : ''}
        </div>
    `);

    document.getElementById('dCancel').addEventListener('click', closeModal);
    document.getElementById('dExport').addEventListener('click', () => exportCasePdf(c.id));

    document.getElementById('addNoteBtn').addEventListener('click', async () => {
        const noteInput = document.getElementById('newNote');
        const text = noteInput.value.trim();
        if (!text) return;
        const r = await nuiFetch('doj:server:addNote', { id: c.id, text });
        if (r.ok) {
            toast('toast_success', t('toast_note_added'));
            document.getElementById('notesList').innerHTML = renderNotes(r.data);
            noteInput.value = '';
        } else { errorToast(r.error); }
    });

    bindEvidenceUpload(c.id);
    bindEvidenceControls(c.id);

    const claimBtn = document.getElementById('dClaimBtn');
    if (claimBtn) {
        claimBtn.addEventListener('click', async () => {
            const r = await nuiFetch('doj:server:submitClaim', c.id);
            if (r.ok) { toast('toast_success', t('toast_claim_sent')); openCaseDetail(c.id); }
            else errorToast(r.error);
        });
    }

    if (canEdit) {
        document.getElementById('dSave').addEventListener('click', async () => {
            const title = document.getElementById('dTitle').value.trim();
            const description = document.getElementById('dDesc').value.trim();
            const status = document.getElementById('dStatus').value;
            const r = await nuiFetch('doj:server:updateCase', { id: c.id, title, description, status });
            if (r.ok) {
                toast('toast_success', t('toast_changes_saved'));
                closeModal();
                navigate(state.currentPage);
            } else { errorToast(r.error); }
        });
    }

    if (canVerdict) {
        document.getElementById('dVerdict').addEventListener('click', async () => {
            const verdict = document.getElementById('verdictText').value.trim();
            if (!verdict) { toast('toast_error', t('toast_fill_required')); return; }
            const r = await nuiFetch('doj:server:issueVerdict', { id: c.id, verdict });
            if (r.ok) {
                toast('toast_success', t('toast_verdict_issued'));
                closeModal();
                navigate(state.currentPage);
            } else { errorToast(r.error); }
        });
    }
}

function chipHtml(text) {
    return `<span class="badge" style="border-color:var(--border); color:var(--gold); margin-inline-end:6px;">${escapeHtml(text)}</span>`;
}

function renderNotes(notes) {
    if (!notes || !notes.length) return `<span style="color:var(--text-dim); font-size:12px;">${escapeHtml(t('no_notes'))}</span>`;
    return notes.map(n => `
        <div class="note-item">
            <div class="note-head"><b>${escapeHtml(n.author_name)} · ${escapeHtml(t('role_' + n.author_role))}</b><span>${escapeHtml(n.created_at)}</span></div>
            <div>${escapeHtml(n.text)}</div>
        </div>
    `).join('');
}

// ------------------------------------------------------------
// Evidence gallery (upload + compress + reorder + delete)
// ------------------------------------------------------------
function renderEvidenceGallery(evidence, caseId, editable) {
    if (!evidence || !evidence.length) return `<div style="color:var(--text-dim); font-size:12px;">${escapeHtml(t('no_evidence'))}</div>`;
    return `<div class="evidence-grid">
        ${evidence.map((ev, idx) => `
            <div class="evidence-item" data-id="${ev.id}">
                <img src="${escapeHtml(ev.image_url)}" alt="evidence" loading="lazy" onerror="this.style.opacity=0.25;">
                ${ev.caption ? `<div class="evidence-caption">${escapeHtml(ev.caption)}</div>` : ''}
                ${editable ? `
                <div class="evidence-actions">
                    <button class="btn btn-sm evidence-up" data-idx="${idx}" title="${escapeHtml(t('btn_move_up'))}"><i class="fa-solid fa-arrow-up"></i></button>
                    <button class="btn btn-sm evidence-down" data-idx="${idx}" title="${escapeHtml(t('btn_move_down'))}"><i class="fa-solid fa-arrow-down"></i></button>
                    <button class="btn btn-sm btn-danger evidence-del" data-id="${ev.id}" title="${escapeHtml(t('btn_delete'))}"><i class="fa-solid fa-trash"></i></button>
                </div>` : ''}
            </div>
        `).join('')}
    </div>`;
}

function bindEvidenceUpload(caseId) {
    const addBtn = document.getElementById('addEvidenceBtn');
    if (!addBtn) return;

    addBtn.addEventListener('click', async () => {
        const urlInput = document.getElementById('evidenceUrl');
        const captionInput = document.getElementById('evidenceCaption');
        const image_url = urlInput.value.trim();
        const caption = captionInput.value.trim();

        if (!image_url) { toast('toast_error', t('toast_fill_required')); return; }
        if (!/^https?:\/\//i.test(image_url)) { toast('toast_error', t('toast_invalid_url')); return; }

        addBtn.disabled = true;
        const r = await nuiFetch('doj:server:addEvidence', { id: caseId, image_url, caption });
        addBtn.disabled = false;

        if (r.ok) {
            toast('toast_success', t('toast_evidence_added'));
            document.getElementById('evidenceGallery').innerHTML = renderEvidenceGallery(r.data, caseId, true);
            urlInput.value = '';
            captionInput.value = '';
            bindEvidenceControls(caseId);
        } else {
            errorToast(r.error);
        }
    });
}

function bindEvidenceControls(caseId) {
    const gallery = document.getElementById('evidenceGallery');
    if (!gallery) return;

    // نحدّث الواجهة محليًا فورًا بدل ما نعيد تحميل القضية كاملة (عنوان+وصف+ملاحظات+أدلة+فحص طلبات)
    // من السيرفر لمجرد حذف صورة أو تحريكها. هذا يقلل عدد نداءات قاعدة البيانات بشكل كبير.
    gallery.querySelectorAll('.evidence-del').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = parseInt(btn.dataset.id);
            const r = await nuiFetch('doj:server:deleteEvidence', { id, case_id: caseId });
            if (r.ok) {
                btn.closest('.evidence-item').remove();
            } else {
                errorToast(r.error);
            }
        });
    });

    const getOrderedIds = () => Array.from(gallery.querySelectorAll('.evidence-item')).map(el => parseInt(el.dataset.id));

    gallery.querySelectorAll('.evidence-up').forEach(btn => {
        btn.addEventListener('click', async () => {
            const item = btn.closest('.evidence-item');
            const prev = item.previousElementSibling;
            if (!prev) return;
            gallery.insertBefore(item, prev);
            const order = getOrderedIds();
            const r = await nuiFetch('doj:server:reorderEvidence', { case_id: caseId, order });
            if (!r.ok) { gallery.insertBefore(prev, item); errorToast(r.error); }
        });
    });

    gallery.querySelectorAll('.evidence-down').forEach(btn => {
        btn.addEventListener('click', async () => {
            const item = btn.closest('.evidence-item');
            const next = item.nextElementSibling;
            if (!next) return;
            gallery.insertBefore(next, item);
            const order = getOrderedIds();
            const r = await nuiFetch('doj:server:reorderEvidence', { case_id: caseId, order });
            if (!r.ok) { gallery.insertBefore(item, next); errorToast(r.error); }
        });
    });
}

// ============================================================
// STAFF: CITIZEN SEARCH
// ============================================================
async function renderStaffSearch() {
    viewArea().innerHTML = `
        <div class="toolbar"><input class="input" id="citizenSearch" placeholder="${escapeHtml(t('field_search'))}" style="min-width:320px;"></div>
        <div id="searchResult"></div>
    `;

    const doSearch = async () => {
        const q = document.getElementById('citizenSearch').value.trim();
        if (!q) { document.getElementById('searchResult').innerHTML = ''; return; }
        const res = await nuiFetch('doj:server:searchCitizen', q);
        const list = res.ok ? res.data : [];
        document.getElementById('searchResult').innerHTML = list.length ? `
            <div class="table-wrap">
                <table>
                    <thead><tr><th>${t('table_name')}</th><th>${t('table_id')}</th><th>${t('field_phone')}</th><th></th></tr></thead>
                    <tbody>
                        ${list.map(p => `
                            <tr>
                                <td>${escapeHtml(p.name)}</td>
                                <td>${escapeHtml(p.citizenid)}</td>
                                <td>${escapeHtml(p.phone || '—')}</td>
                                <td style="display:flex; gap:8px;">
                                    <button class="btn btn-sm" data-view="${p.citizenid}"><i class="fa-solid fa-eye"></i> ${escapeHtml(t('btn_view_record'))}</button>
                                    ${(state.role === 'prosecutor' || state.role === 'judge') ? `<button class="btn btn-sm btn-primary" data-new="${p.citizenid}"><i class="fa-solid fa-plus"></i> ${escapeHtml(t('btn_new_case'))}</button>` : ''}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        ` : `<div class="empty-state"><i class="fa-solid fa-magnifying-glass"></i><span>${escapeHtml(t('empty_search_results'))}</span></div>`;

        document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => openCitizenRecordModal(btn.dataset.view)));
        document.querySelectorAll('[data-new]').forEach(btn => btn.addEventListener('click', () => openCreateCaseModal(btn.dataset.new)));
    };

    document.getElementById('citizenSearch').addEventListener('input', debounce(doSearch, 350));
}

async function openCitizenRecordModal(citizenid) {
    const res = await nuiFetch('doj:server:getCitizenRecord', citizenid);
    if (!res.ok) { errorToast(res.error); return; }
    const { citizen, cases } = res.data;

    openModal(`
        <h2><i class="fa-solid fa-file-shield"></i> ${escapeHtml(t('modal_citizen_record'))}</h2>
        <div class="grid grid-2" style="margin-bottom:16px;">
            <div class="field"><label>${escapeHtml(t('table_name'))}</label><input class="input" value="${escapeHtml(citizen.name)}" disabled></div>
            <div class="field"><label>${escapeHtml(t('table_id'))}</label><input class="input" value="${escapeHtml(citizen.citizenid)}" disabled></div>
            <div class="field"><label>${escapeHtml(t('field_phone'))}</label><input class="input" value="${escapeHtml(citizen.phone || '—')}" disabled></div>
        </div>
        ${renderCasesTable(cases)}
        <div class="modal-actions"><button class="btn" id="closeRecord">${escapeHtml(t('btn_close'))}</button></div>
    `);
    document.getElementById('closeRecord').addEventListener('click', closeModal);
    bindCaseRows(cases);
}

// ============================================================
// STAFF: REQUESTS (prosecutor / judge)
// ============================================================
async function renderStaffRequests() {
    viewArea().innerHTML = `
        <div class="toolbar">
            <select class="input" id="reqStatusFilter">
                <option value="all">${escapeHtml(t('table_status'))}</option>
                ${state.requestStatuses.map(s => `<option value="${s}">${escapeHtml(t('request_status_' + s))}</option>`).join('')}
            </select>
        </div>
        <div id="reqResult" class="card">${loadingBlock()}</div>
    `;

    const load = async () => {
        const status = document.getElementById('reqStatusFilter').value;
        const res = await nuiFetch('doj:server:getAllRequests', { status });
        const list = res.ok ? res.data : [];
        document.getElementById('reqResult').innerHTML = list.length ? `
            <div class="table-wrap">
                <table>
                    <thead><tr><th>${t('table_subject')}</th><th>${t('table_citizen')}</th><th>${t('table_status')}</th><th>${t('table_submitted')}</th><th></th></tr></thead>
                    <tbody>
                        ${list.map(r => `
                            <tr>
                                <td>${escapeHtml(r.subject)}</td>
                                <td>${escapeHtml(r.citizen_name)}</td>
                                <td>${badgeRequest(r.status)}</td>
                                <td>${escapeHtml(r.created_at)}</td>
                                <td><button class="btn btn-sm" data-req="${r.id}"><i class="fa-solid fa-arrow-up-right-from-square"></i></button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        ` : `<div class="empty-state"><i class="fa-solid fa-inbox"></i><span>${escapeHtml(t('empty_no_requests'))}</span></div>`;

        document.querySelectorAll('[data-req]').forEach(btn => {
            const req = list.find(r => String(r.id) === btn.dataset.req);
            btn.addEventListener('click', () => openRequestModal(req));
        });
    };

    document.getElementById('reqStatusFilter').addEventListener('change', load);
    load();
}

function openRequestModal(r) {
    const canCreateCase = r.status === 'approved' && !r.linked_case_id;
    const hasLinkedCase = !!r.linked_case_id;

    openModal(`
        <h2><i class="fa-solid fa-file-lines"></i> ${escapeHtml(r.subject)}</h2>
        <div class="field"><label>${escapeHtml(t('table_citizen'))}</label><input class="input" value="${escapeHtml(r.citizen_name)}" disabled></div>
        <div class="field"><label>${escapeHtml(t('field_request_details'))}</label><textarea class="input" disabled>${escapeHtml(r.description)}</textarea></div>
        <div class="field">
            <label>${escapeHtml(t('field_status'))}</label>
            <select class="input" id="rStatus">${state.requestStatuses.map(s => `<option value="${s}" ${s === r.status ? 'selected' : ''}>${escapeHtml(t('request_status_' + s))}</option>`).join('')}</select>
        </div>
        <div class="field"><label>${escapeHtml(t('field_hearing_date'))}</label><input class="input" type="datetime-local" id="rDate"></div>
        ${hasLinkedCase ? `<div class="field"><span class="badge" style="border-color:var(--success); color:var(--success); background:rgba(74,222,128,0.1);"><i class="fa-solid fa-link"></i> ${escapeHtml(t('request_linked_case_note'))}</span></div>` : ''}
        <div class="modal-actions">
            ${canCreateCase ? `<button class="btn btn-primary" id="rCreateCase"><i class="fa-solid fa-folder-plus"></i> ${escapeHtml(t('btn_create_case_from_request'))}</button>` : ''}
            ${hasLinkedCase ? `<button class="btn" id="rViewCase"><i class="fa-solid fa-folder-open"></i> ${escapeHtml(t('btn_view_linked_case'))}</button>` : ''}
            <button class="btn" id="rCancel">${escapeHtml(t('btn_cancel'))}</button>
            <button class="btn" id="rSave"><i class="fa-solid fa-check"></i> ${escapeHtml(t('btn_save'))}</button>
        </div>
    `);
    document.getElementById('rCancel').addEventListener('click', closeModal);
    document.getElementById('rSave').addEventListener('click', async () => {
        const status = document.getElementById('rStatus').value;
        const dateVal = document.getElementById('rDate').value;
        const hearing_date = dateVal ? dateVal.replace('T', ' ') + ':00' : null;
        const res = await nuiFetch('doj:server:updateRequest', { id: r.id, status, hearing_date });
        if (res.ok) { toast('toast_success', t('toast_request_updated')); closeModal(); renderStaffRequests(); }
        else errorToast(res.error);
    });

    const createCaseBtn = document.getElementById('rCreateCase');
    if (createCaseBtn) {
        createCaseBtn.addEventListener('click', () => {
            closeModal();
            openCreateCaseModal(r.citizenid, r.subject, r.description, r.id);
        });
    }

    const viewCaseBtn = document.getElementById('rViewCase');
    if (viewCaseBtn) {
        viewCaseBtn.addEventListener('click', () => {
            closeModal();
            openCaseDetail(r.linked_case_id);
        });
    }
}

// ============================================================
// STAFF: AUDIT LOG (judge only)
// ============================================================
async function renderStaffAudit() {
    viewArea().innerHTML = `
        <div class="toolbar"><input class="input" id="auditSearch" placeholder="${escapeHtml(t('field_search'))}" style="min-width:280px;"></div>
        <div id="auditResult" class="card">${loadingBlock()}</div>
    `;

    const load = async () => {
        const search = document.getElementById('auditSearch').value;
        const res = await nuiFetch('doj:server:getAuditLog', { search });
        const list = res.ok ? res.data : [];
        document.getElementById('auditResult').innerHTML = list.length ? `
            <div class="table-wrap">
                <table>
                    <thead><tr><th>${t('audit_actor')}</th><th>${t('audit_role')}</th><th>${t('audit_action')}</th><th>${t('audit_details')}</th><th>${t('audit_date')}</th></tr></thead>
                    <tbody>
                        ${list.map(a => `
                            <tr>
                                <td>${escapeHtml(a.actor_name)}</td>
                                <td>${escapeHtml(t('role_' + a.actor_role) !== ('role_' + a.actor_role) ? t('role_' + a.actor_role) : a.actor_role)}</td>
                                <td>${escapeHtml(a.action)}</td>
                                <td>${escapeHtml(a.details || '')}</td>
                                <td>${escapeHtml(a.created_at)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        ` : `<div class="empty-state"><i class="fa-solid fa-clipboard-list"></i><span>${escapeHtml(t('empty_no_cases'))}</span></div>`;
    };

    document.getElementById('auditSearch').addEventListener('input', debounce(load, 350));
    load();
}

// ============================================================
// STAFF: PENDING CLAIMS (judge only)
// ============================================================
async function renderStaffClaims() {
    viewArea().innerHTML = `
        <div class="toolbar">
            <select class="input" id="claimStatusFilter">
                <option value="pending">${escapeHtml(t('request_status_pending'))}</option>
                <option value="approved">${escapeHtml(t('request_status_approved'))}</option>
                <option value="rejected">${escapeHtml(t('request_status_rejected'))}</option>
            </select>
        </div>
        <div id="claimsResult" class="card">${loadingBlock()}</div>
    `;

    const load = async () => {
        const status = document.getElementById('claimStatusFilter').value;
        const res = await nuiFetch('doj:server:getPendingClaims', { status });
        const list = res.ok ? res.data : [];
        document.getElementById('claimsResult').innerHTML = list.length ? `
            <div class="table-wrap">
                <table>
                    <thead><tr>
                        <th>${t('table_case_number')}</th><th>${t('table_title')}</th><th>${t('claim_requested_role')}</th>
                        <th>${t('claim_requester')}</th><th>${t('table_submitted')}</th><th></th>
                    </tr></thead>
                    <tbody>
                        ${list.map(cl => `
                            <tr>
                                <td>${escapeHtml(cl.case_number)}</td>
                                <td>${escapeHtml(cl.title)}</td>
                                <td>${escapeHtml(t('role_' + cl.role))}</td>
                                <td>${escapeHtml(cl.requester_name)}</td>
                                <td>${escapeHtml(cl.created_at)}</td>
                                <td style="display:flex; gap:6px;">
                                    ${cl.status === 'pending' ? `
                                        <button class="btn btn-sm btn-primary" data-approve="${cl.id}"><i class="fa-solid fa-check"></i></button>
                                        <button class="btn btn-sm btn-danger" data-reject="${cl.id}"><i class="fa-solid fa-xmark"></i></button>
                                    ` : badgeRequest(cl.status)}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        ` : `<div class="empty-state"><i class="fa-solid fa-user-check"></i><span>${escapeHtml(t('empty_no_requests'))}</span></div>`;

        document.querySelectorAll('[data-approve]').forEach(btn => {
            btn.addEventListener('click', () => handleClaimDecision(parseInt(btn.dataset.approve), 'approved'));
        });
        document.querySelectorAll('[data-reject]').forEach(btn => {
            btn.addEventListener('click', () => handleClaimDecision(parseInt(btn.dataset.reject), 'rejected'));
        });
    };

    document.getElementById('claimStatusFilter').addEventListener('change', load);
    load();
}

async function handleClaimDecision(claimId, decision) {
    const r = await nuiFetch('doj:server:handleClaim', { id: claimId, decision });
    if (r.ok) {
        toast('toast_success', decision === 'approved' ? t('toast_claim_approved') : t('toast_claim_rejected'));
        renderStaffClaims();
    } else {
        errorToast(r.error);
    }
}

// ============================================================
// CITIZEN VIEWS
// ============================================================
async function renderCitizenDashboard() {
    viewArea().innerHTML = loadingBlock();
    const [statsRes, casesRes] = await Promise.all([
        nuiFetch('doj:server:getMyDashboardStats', {}),
        nuiFetch('doj:server:getMyCases', { limit: 5 }),
    ]);
    const stats = statsRes.ok ? statsRes.data : { total_cases: 0, unread_notifications: 0 };
    const cases = casesRes.ok ? casesRes.data : [];

    viewArea().innerHTML = `
        <div class="grid grid-3" style="margin-bottom:20px;">
            ${statCard('fa-solid fa-folder-open', stats.total_cases, t('stat_my_cases'))}
            ${statCard('fa-solid fa-bell', stats.unread_notifications, t('stat_unread_notifs'))}
            ${statCard('fa-solid fa-file-circle-plus', '—', t('stat_new_request'))}
        </div>
        <div class="card">
            <b>${escapeHtml(t('stat_latest_your_cases'))}</b>
            <div style="margin-top:12px;">${renderCasesTableCitizen(cases)}</div>
        </div>
    `;
    bindCitizenCaseRows(cases);
}

function renderCasesTableCitizen(cases) {
    if (!cases.length) return `<div class="empty-state"><i class="fa-solid fa-inbox"></i><span>${escapeHtml(t('empty_no_cases'))}</span></div>`;
    return `
        <div class="table-wrap">
            <table>
                <thead><tr><th>${t('table_case_number')}</th><th>${t('table_title')}</th><th>${t('table_type')}</th><th>${t('table_status')}</th><th>${t('table_date')}</th></tr></thead>
                <tbody>
                    ${cases.map(c => `
                        <tr data-id="${c.id}">
                            <td>${escapeHtml(c.case_number)}</td>
                            <td>${escapeHtml(c.title)}</td>
                            <td>${escapeHtml(caseTypeLabel(c.type))}</td>
                            <td>${badgeCase(c.status)}</td>
                            <td>${escapeHtml(c.created_at)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}
function bindCitizenCaseRows(cases) {
    document.querySelectorAll('tbody tr[data-id]').forEach(row => {
        row.addEventListener('click', () => openCitizenCaseDetail(cases.find(c => String(c.id) === row.dataset.id)));
    });
}

async function renderCitizenCases() {
    viewArea().innerHTML = loadingBlock();
    const res = await nuiFetch('doj:server:getMyCases', {});
    const cases = res.ok ? res.data : [];
    viewArea().innerHTML = `<div class="card">${renderCasesTableCitizen(cases)}</div>`;
    bindCitizenCaseRows(cases);
}

function openCitizenCaseDetail(c) {
    if (!c) return;
    openModal(`
        <h2><i class="fa-solid fa-folder-open"></i> ${escapeHtml(c.case_number)}</h2>
        <div class="field"><label>${escapeHtml(t('field_case_title'))}</label><div>${escapeHtml(c.title)}</div></div>
        <div class="field"><label>${escapeHtml(t('field_description'))}</label><div>${escapeHtml(c.description || '—')}</div></div>
        <div class="field"><label>${escapeHtml(t('field_status'))}</label>${badgeCase(c.status)}</div>
        <div class="field"><label>${escapeHtml(t('field_charges'))}</label><div>${(c.charges || []).map(ch => chipHtml(ch)).join(' ') || '—'}</div></div>
        <div class="field"><label>${escapeHtml(t('field_lawyer'))}</label><div>${escapeHtml(c.lawyer_name || '—')}</div></div>
        <div class="field"><label>${escapeHtml(t('field_judge'))}</label><div>${escapeHtml(c.judge_name || '—')}</div></div>
        ${c.verdict ? `<div class="field"><label>${escapeHtml(t('field_verdict'))}</label><div class="card">${escapeHtml(c.verdict)}</div></div>` : `<div class="field"><label>${escapeHtml(t('field_verdict'))}</label><div style="color:var(--text-dim); font-size:12px;">${escapeHtml(t('no_verdict_yet'))}</div></div>`}
        <div class="modal-actions">
            <button class="btn" id="cExport"><i class="fa-solid fa-file-pdf"></i> ${escapeHtml(t('btn_export_pdf'))}</button>
            <button class="btn" id="cClose">${escapeHtml(t('btn_close'))}</button>
        </div>
    `);
    document.getElementById('cClose').addEventListener('click', closeModal);
    document.getElementById('cExport').addEventListener('click', () => exportCasePdf(c.id));
}

function renderCitizenNewRequest() {
    viewArea().innerHTML = `
        <div class="card" style="max-width:560px;">
            <div class="field"><label>${escapeHtml(t('field_subject'))}</label><input class="input" id="reqSubject"></div>
            <div class="field"><label>${escapeHtml(t('field_target_name'))}</label><input class="input" id="reqTargetName"></div>
            <div class="field"><label>${escapeHtml(t('field_target_id'))}</label><input class="input" id="reqTargetId"></div>
            <div class="field"><label>${escapeHtml(t('field_request_details'))}</label><textarea class="input" id="reqDesc"></textarea></div>
            <button class="btn btn-primary" id="reqSubmit"><i class="fa-solid fa-paper-plane"></i> ${escapeHtml(t('btn_send_request'))}</button>
        </div>
    `;

    document.getElementById('reqSubmit').addEventListener('click', async () => {
        const subject = document.getElementById('reqSubject').value.trim();
        const description = document.getElementById('reqDesc').value.trim();
        const target_name = document.getElementById('reqTargetName').value.trim();
        const target_citizenid = document.getElementById('reqTargetId').value.trim();

        if (!subject || !description) { toast('toast_error', t('toast_fill_required')); return; }

        const res = await nuiFetch('doj:server:submitCaseRequest', { subject, description, target_name, target_citizenid });
        if (res.ok) { toast('toast_success', t('toast_request_sent')); navigate('citizen_requests'); }
        else errorToast(res.error);
    });
}

async function renderCitizenRequests() {
    viewArea().innerHTML = loadingBlock();
    const res = await nuiFetch('doj:server:getMyRequests', {});
    const list = res.ok ? res.data : [];
    viewArea().innerHTML = `
        <div class="card">
            ${list.length ? `
                <div class="table-wrap">
                    <table>
                        <thead><tr><th>${t('table_subject')}</th><th>${t('table_status')}</th><th>${t('table_hearing_date')}</th><th>${t('table_submitted')}</th></tr></thead>
                        <tbody>
                            ${list.map(r => `
                                <tr>
                                    <td>${escapeHtml(r.subject)}</td>
                                    <td>${badgeRequest(r.status)}</td>
                                    <td>${escapeHtml(r.hearing_date || '—')}</td>
                                    <td>${escapeHtml(r.created_at)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : `<div class="empty-state"><i class="fa-solid fa-inbox"></i><span>${escapeHtml(t('empty_no_requests'))}</span></div>`}
        </div>
    `;
}

async function renderCitizenNotifications() {
    viewArea().innerHTML = loadingBlock();
    const res = await nuiFetch('doj:server:getMyNotifications', {});
    const list = res.ok ? res.data : [];

    viewArea().innerHTML = `
        <div class="card">
            ${list.length ? list.map(n => `
                <div class="note-item" style="${n.is_read ? 'opacity:.6;' : ''}" data-id="${n.id}">
                    <div class="note-head"><b>${escapeHtml(n.title)}</b><span>${escapeHtml(n.created_at)}</span></div>
                    <div>${escapeHtml(n.message)}</div>
                </div>
            `).join('') : `<div class="empty-state"><i class="fa-solid fa-bell-slash"></i><span>${escapeHtml(t('empty_no_notifications'))}</span></div>`}
        </div>
    `;

    document.querySelectorAll('.note-item[data-id]').forEach(el => {
        el.addEventListener('click', async () => {
            await nuiFetch('doj:server:markNotificationRead', el.dataset.id);
            el.style.opacity = '.6';
        });
    });
}

// ============================================================
// PDF EXPORT (in-app preview + browser print)
//
// ملاحظة: بعض بيئات CEF داخل FiveM قد لا تدعم نافذة الطباعة الأصلية (window.print)
// بشكل كامل. عشان كذا نعرض التقرير دايمًا كمعاينة داخل التابلت (تقدر تصوّره بأي حال)،
// ونحاول كمان نفتح نافذة الطباعة الفعلية لو مدعومة ببيئتك.
// ============================================================
function buildCaseReportHtml(c) {
    return `
        <div class="print-header">
            <h1>${escapeHtml(state.system)}</h1>
            <h2>${escapeHtml(t('print_report_title'))}</h2>
            <p>${escapeHtml(t('print_generated_on'))}: ${new Date().toLocaleString()}</p>
        </div>
        <table class="print-meta">
            <tr><td><b>${escapeHtml(t('print_case_no'))}</b></td><td>${escapeHtml(c.case_number)}</td></tr>
            <tr><td><b>${escapeHtml(t('print_type'))}</b></td><td>${escapeHtml(caseTypeLabel(c.type))}</td></tr>
            <tr><td><b>${escapeHtml(t('print_status'))}</b></td><td>${escapeHtml(t('case_status_' + c.status))}</td></tr>
            <tr><td><b>${escapeHtml(t('print_citizen'))}</b></td><td>${escapeHtml(c.citizen_name)} (${escapeHtml(c.citizen_citizenid)})</td></tr>
            <tr><td><b>${escapeHtml(t('print_prosecutor'))}</b></td><td>${escapeHtml(c.prosecutor_name || '—')}</td></tr>
            <tr><td><b>${escapeHtml(t('print_lawyer'))}</b></td><td>${escapeHtml(c.lawyer_name || '—')}</td></tr>
            <tr><td><b>${escapeHtml(t('print_judge'))}</b></td><td>${escapeHtml(c.judge_name || '—')}</td></tr>
        </table>

        <h3>${escapeHtml(t('print_description'))}</h3>
        <p>${escapeHtml(c.description || '—')}</p>

        <h3>${escapeHtml(t('print_charges'))}</h3>
        <p>${(c.charges || []).map(escapeHtml).join(', ') || '—'}</p>

        ${c.verdict ? `
            <h3>${escapeHtml(t('print_verdict'))}</h3>
            <p>${escapeHtml(c.verdict)}</p>
            <p><b>${escapeHtml(t('print_verdict_date'))}:</b> ${escapeHtml(c.verdict_date || '—')}</p>
        ` : ''}

        <h3>${escapeHtml(t('print_notes'))}</h3>
        ${(c.notes || []).map(n => `<p>• <b>${escapeHtml(n.author_name)}</b> (${escapeHtml(n.created_at)}): ${escapeHtml(n.text)}</p>`).join('') || `<p>—</p>`}

        <h3>${escapeHtml(t('print_evidence'))}</h3>
        <div class="print-evidence-grid">
            ${(c.evidence || []).map(ev => `<div class="print-evidence-item"><img src="${escapeHtml(ev.image_url)}" onerror="this.style.display='none';">${ev.caption ? `<div>${escapeHtml(ev.caption)}</div>` : ''}</div>`).join('') || '<p>—</p>'}
        </div>

        <div class="print-footer">${escapeHtml(t('print_footer'))}</div>
    `;
}

async function exportCasePdf(caseId) {
    try {
        const res = await nuiFetch('doj:server:getCaseForExport', caseId);
        if (!res.ok) { errorToast(res.error); return; }
        const c = res.data;

        const reportHtml = buildCaseReportHtml(c);

        // نحدّث منطقة الطباعة الحقيقية (يستخدمها window.print عبر CSS @media print)
        const printArea = document.getElementById('printArea');
        printArea.innerHTML = reportHtml;

        // ونعرض نفس التقرير كمعاينة داخل مودال بالتابلت، مضمونة الظهور بكل الأحوال
        openModal(`
            <h2><i class="fa-solid fa-file-pdf"></i> ${escapeHtml(t('print_report_title'))}</h2>
            <div class="report-preview">${reportHtml}</div>
            <div class="modal-actions">
                <button class="btn" id="reportClose">${escapeHtml(t('btn_close'))}</button>
                <button class="btn btn-primary" id="reportPrint"><i class="fa-solid fa-print"></i> ${escapeHtml(t('btn_print'))}</button>
            </div>
        `);

        document.getElementById('reportClose').addEventListener('click', closeModal);
        document.getElementById('reportPrint').addEventListener('click', () => {
            try {
                window.print();
            } catch (e) {
                console.error('print failed', e);
                toast('toast_error', t('toast_print_unsupported'));
            }
        });
    } catch (e) {
        console.error('exportCasePdf failed', e);
        toast('toast_error', t('toast_load_error'));
    }
}
