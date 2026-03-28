/**
 * scripts.js — TaskFlow
 * =====================
 * Toda a comunicação com o back-end é feita exclusivamente neste arquivo.
 *
 * Rotas do servidor (porta 8000):
 *   POST   /auth/signup           { name, email, password }             → 201 { access_token, user }
 *   POST   /auth/login            { email, password }                   → 200 { access_token, user }
 *   GET    /auth/me               Authorization: Bearer <token>         → 200 { id, name, email }
 *   GET    /tasks                 Authorization: Bearer <token>         → 200 { tasks: [...] }
 *   POST   /tasks                 Authorization: Bearer <token>         → 201 tarefa
 *   PUT    /tasks/:id             Authorization: Bearer <token>         → 200 tarefa atualizada
 *   DELETE /tasks/:id             Authorization: Bearer <token>         → 204 sem conteúdo
 *
 * Disciplina: Desenvolvimento Front-End
 * Professor : Lucas Cordeiro Romão
 */

/* ================================================================
   CONFIGURAÇÃO
   ================================================================ */

/** URL base do servidor back-end */
const BASE_URL = 'http://localhost:8000';

/** Chave de armazenamento do token JWT */
const TOKEN_KEY = 'taskflow_token';

/** Chave de armazenamento do nome do usuário */
const USER_KEY  = 'taskflow_user';

/** ID da tarefa aguardando confirmação de exclusão */
let pendingDeleteId = null;

/* ================================================================
   GERENCIAMENTO DE SESSÃO
   ================================================================ */

/**
 * Retorna o token JWT salvo no localStorage.
 * @returns {string|null}
 */
function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Persiste o token e o nome do usuário no localStorage.
 * @param {string} token
 * @param {string} userName
 */
function saveSession(token, userName) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, userName);
}

/**
 * Remove a sessão (logout local).
 */
function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/**
 * Redireciona para login.html se não houver sessão ativa.
 * Deve ser chamado no carregamento de páginas protegidas.
 */
function requireAuth() {
  if (!getToken()) {
    window.location.href = 'login.html';
  }
}

/* ================================================================
   UTILITÁRIO DE REQUISIÇÃO HTTP
   ================================================================ */

/**
 * Realiza uma requisição HTTP ao servidor.
 * Adiciona automaticamente o header Authorization quando há token salvo.
 *
 * @param {string} endpoint  - Rota relativa, ex: '/auth/login'
 * @param {string} [method]  - Método HTTP (padrão: 'GET')
 * @param {object} [body]    - Corpo da requisição (será serializado em JSON)
 * @returns {Promise<any>}   - Dados retornados pelo servidor
 * @throws {Error}           - Erro com a mensagem recebida do servidor
 */
async function request(endpoint, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };

  /* Injeta o token se existir */
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, options);

  /* Tenta parsear o corpo como JSON; retorna objeto vazio em caso de falha */
  let data = {};
  try {
    data = await response.json();
  } catch (_) { /* sem corpo (ex: 204 No Content) */ }

  /* Erros HTTP → lança com a mensagem retornada pelo servidor */
  if (!response.ok) {
    throw new Error(data.detail || data.message || data.error || `Erro ${response.status}`);
  }

  return data;
}

/* ================================================================
   UTILITÁRIOS DE INTERFACE
   ================================================================ */

/**
 * Exibe uma mensagem de feedback em um elemento da página.
 * @param {string} elementId  - ID do elemento <div id="msg">
 * @param {string} text       - Texto da mensagem
 * @param {'success'|'error'} type
 */
function showMsg(elementId, text, type) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = text;
  el.className = `msg ${type}`;
}

/**
 * Oculta a mensagem de feedback.
 * @param {string} elementId
 */
function hideMsg(elementId) {
  const el = document.getElementById(elementId);
  if (el) el.className = 'msg hidden';
}

/**
 * Desabilita ou habilita um botão, trocando seu texto temporariamente.
 * @param {string} btnId   - ID do botão
 * @param {boolean} state  - true = desabilitar
 * @param {string} [label] - Texto enquanto desabilitado
 */
function setLoading(btnId, state, label = 'Aguarde…') {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = state;
  if (state) {
    btn._originalText = btn.textContent;
    btn.textContent = label;
  } else {
    btn.textContent = btn._originalText || btn.textContent;
  }
}

/**
 * Formata uma data ISO 'YYYY-MM-DD' para exibição legível em pt-BR.
 * @param {string|null} dateStr
 * @returns {string}
 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  /* Usa UTC para evitar deslocamento de fuso horário */
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

/**
 * Verifica se uma data (YYYY-MM-DD) é anterior a hoje.
 * @param {string|null} dateStr
 * @returns {boolean}
 */
function isOverdue(dateStr) {
  if (!dateStr) return false;
  const today = new Date().toISOString().slice(0, 10); /* YYYY-MM-DD */
  return dateStr < today;
}

/* ================================================================
   PÁGINA DE LOGIN (login.html)
   ================================================================ */

/**
 * Chamado pelo botão "Entrar" na página de login.
 * Lê os campos de e-mail e senha, chama POST /auth/login e redireciona.
 */
async function handleLogin() {
  hideMsg('msg');
  setLoading('btn-login', true, 'Entrando…');

  const email    = document.getElementById('email')?.value.trim();
  const password = document.getElementById('password')?.value;

  /* Validação básica no front-end antes de chamar a API */
  if (!email || !password) {
    showMsg('msg', 'Preencha todos os campos.', 'error');
    setLoading('btn-login', false);
    return;
  }

  try {
    const data = await request('/auth/login', 'POST', { email, password });

    /* Salva token e nome do usuário na sessão */
    saveSession(data.access_token, data.user?.name || email);

    /* Redireciona para a página de tarefas */
    window.location.href = 'tasks.html';

  } catch (err) {
    showMsg('msg', err.message, 'error');
    setLoading('btn-login', false);
  }
}

/* ================================================================
   PÁGINA DE REGISTRO (register.html)
   ================================================================ */

/**
 * Chamado pelo botão "Criar conta" na página de registro.
 * Lê os campos name, email, password e chama POST /auth/signup.
 */
async function handleRegister() {
  hideMsg('msg');
  setLoading('btn-register', true, 'Criando conta…');

  const name     = document.getElementById('name')?.value.trim();
  const email    = document.getElementById('email')?.value.trim();
  const password = document.getElementById('password')?.value;

  /* Validação local */
  if (!name || !email || !password) {
    showMsg('msg', 'Preencha todos os campos.', 'error');
    setLoading('btn-register', false);
    return;
  }
  if (password.length < 4) {
    showMsg('msg', 'A senha deve ter ao menos 4 caracteres.', 'error');
    setLoading('btn-register', false);
    return;
  }

  try {
    const data = await request('/auth/signup', 'POST', { name, email, password });

    /* Registro retorna token: salva e redireciona diretamente */
    saveSession(data.access_token, data.user?.name || name);
    window.location.href = 'tasks.html';

  } catch (err) {
    showMsg('msg', err.message, 'error');
    setLoading('btn-register', false);
  }
}

/* ================================================================
   PÁGINA DE TAREFAS (tasks.html)
   ================================================================ */

/* ---- Inicialização da página ---- */

/**
 * Executado ao carregar a página de tarefas.
 * Verifica autenticação, exibe o nome do usuário e carrega as tarefas.
 */
async function initTasksPage() {
  /* Redireciona para login se não houver token */
  requireAuth();

  /* Exibe o nome do usuário na navbar */
  const userName = localStorage.getItem(USER_KEY) || 'Usuário';
  const navbarUser = document.getElementById('navbar-user');
  if (navbarUser) navbarUser.textContent = `Olá, ${userName}`;

  /* Carrega as tarefas do servidor */
  await loadTasks();
}

/* ---- CRUD de Tarefas ---- */

/**
 * Busca todas as tarefas do usuário autenticado (GET /tasks)
 * e renderiza na tela.
 */
async function loadTasks() {
  try {
    const data = await request('/tasks');
    renderTasks(data.tasks || []);
  } catch (err) {
    showMsg('msg', `Erro ao carregar tarefas: ${err.message}`, 'error');
    renderTasks([]);
  }
}

/**
 * Renderiza a lista de tarefas no DOM.
 * @param {Array} tasks - Array de objetos de tarefa retornados pelo servidor
 */
function renderTasks(tasks) {
  const listEl    = document.getElementById('task-list');
  const emptyEl   = document.getElementById('empty-state');
  const countEl   = document.getElementById('tasks-count');

  if (!listEl) return;

  /* Atualiza o contador de tarefas */
  if (countEl) {
    const total = tasks.length;
    countEl.textContent = total === 0
      ? 'Nenhuma tarefa ainda'
      : total === 1 ? '1 tarefa' : `${total} tarefas`;
  }

  /* Mostra estado vazio ou limpa a lista */
  if (tasks.length === 0) {
    listEl.innerHTML = '';
    emptyEl?.classList.remove('hidden');
    return;
  }
  emptyEl?.classList.add('hidden');

  /* Gera o HTML para cada tarefa */
  listEl.innerHTML = tasks.map(task => buildTaskCardHTML(task)).join('');
}

/**
 * Constrói o HTML de um card de tarefa.
 * @param {object} task - Objeto de tarefa da API
 * @returns {string}
 */
function buildTaskCardHTML(task) {
  /* Badge de prazo (deadline) */
  let deadlineBadge = '';
  if (task.deadline) {
    const overdue = isOverdue(task.deadline);
    const cls     = overdue ? 'overdue' : 'deadline';
    const icon    = overdue ? '⚠️' : '📅';
    deadlineBadge = `<span class="task-badge ${cls}">${icon} ${formatDate(task.deadline)}</span>`;
  }

  /* Data de criação formatada */
  const createdAt = task.created_at
    ? new Date(task.created_at).toLocaleDateString('pt-BR')
    : '';

  /* Descrição (renderiza apenas se existir) */
  const description = task.description
    ? `<p class="task-card-desc">${escapeHtml(task.description)}</p>`
    : '';

  return `
    <div class="task-card" id="task-${task.id}">
      <div class="task-body">
        <h3 class="task-card-title">${escapeHtml(task.title)}</h3>
        ${description}
        <div class="task-meta">
          ${deadlineBadge}
          ${createdAt ? `<span class="task-date">Criada em ${createdAt}</span>` : ''}
        </div>
      </div>
      <div class="task-actions">
        <button class="btn btn-edit" onclick="openEditModal(${task.id})">✏️ Editar</button>
        <button class="btn btn-del"  onclick="askDelete(${task.id})">🗑️ Excluir</button>
      </div>
    </div>
  `;
}

/**
 * Escapa caracteres HTML para evitar XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---- Modal de criação / edição ---- */

/**
 * Abre o modal para CRIAR uma nova tarefa (campos em branco).
 */
function openModal() {
  document.getElementById('task-id').value        = '';
  document.getElementById('task-title').value     = '';
  document.getElementById('task-description').value = '';
  document.getElementById('task-deadline').value  = '';
  document.getElementById('modal-title-text').textContent = 'Nova Tarefa';
  document.getElementById('task-modal').classList.remove('hidden');
  document.getElementById('task-title').focus();
}

/**
 * Abre o modal pré-preenchido para EDITAR uma tarefa existente.
 * Busca os dados da tarefa via GET /tasks/:id.
 * @param {number} taskId
 */
async function openEditModal(taskId) {
  try {
    const task = await request(`/tasks/${taskId}`);

    document.getElementById('task-id').value          = task.id;
    document.getElementById('task-title').value       = task.title || '';
    document.getElementById('task-description').value = task.description || '';
    document.getElementById('task-deadline').value    = task.deadline || '';
    document.getElementById('modal-title-text').textContent = 'Editar Tarefa';
    document.getElementById('task-modal').classList.remove('hidden');
    document.getElementById('task-title').focus();

  } catch (err) {
    showMsg('msg', `Erro ao carregar tarefa: ${err.message}`, 'error');
  }
}

/**
 * Fecha o modal de criação/edição.
 */
function closeModal() {
  document.getElementById('task-modal').classList.add('hidden');
  hideMsg('msg');
}

/**
 * Fecha o modal se o clique foi no overlay (fora do card).
 * @param {MouseEvent} event
 */
function closeModalOnOverlay(event) {
  if (event.target.classList.contains('modal-overlay')) closeModal();
}

/**
 * Salva a tarefa: cria (POST /tasks) se não houver ID, ou atualiza (PUT /tasks/:id).
 */
async function handleSaveTask() {
  const id          = document.getElementById('task-id').value;
  const title       = document.getElementById('task-title').value.trim();
  const description = document.getElementById('task-description').value.trim() || null;
  const deadline    = document.getElementById('task-deadline').value || null;

  /* Validação local */
  if (!title) {
    showMsg('msg', 'O título é obrigatório.', 'error');
    return;
  }

  const payload = { title, description, deadline };

  try {
    if (id) {
      /* Edição: PUT /tasks/:id */
      await request(`/tasks/${id}`, 'PUT', payload);
      showMsg('msg', 'Tarefa atualizada com sucesso!', 'success');
    } else {
      /* Criação: POST /tasks */
      await request('/tasks', 'POST', payload);
      showMsg('msg', 'Tarefa criada com sucesso!', 'success');
    }

    closeModal();
    await loadTasks(); /* Recarrega a lista */

  } catch (err) {
    showMsg('msg', err.message, 'error');
  }
}

/* ---- Exclusão de tarefa ---- */

/**
 * Abre o modal de confirmação antes de excluir.
 * @param {number} taskId
 */
function askDelete(taskId) {
  pendingDeleteId = taskId;
  document.getElementById('confirm-modal').classList.remove('hidden');
}

/** Fecha o modal de confirmação de exclusão. */
function closeConfirm() {
  pendingDeleteId = null;
  document.getElementById('confirm-modal').classList.add('hidden');
}

/**
 * Fecha o modal de confirmação se o clique foi no overlay.
 * @param {MouseEvent} event
 */
function closeConfirmOnOverlay(event) {
  if (event.target.classList.contains('modal-overlay')) closeConfirm();
}

/**
 * Confirma a exclusão: chama DELETE /tasks/:id e recarrega a lista.
 */
async function confirmDelete() {
  if (!pendingDeleteId) return;

  try {
    await request(`/tasks/${pendingDeleteId}`, 'DELETE');
    showMsg('msg', 'Tarefa excluída com sucesso!', 'success');
    closeConfirm();
    await loadTasks();

  } catch (err) {
    closeConfirm();
    showMsg('msg', `Erro ao excluir: ${err.message}`, 'error');
  }
}

/* ---- Logout ---- */

/**
 * Encerra a sessão e redireciona para login.html.
 */
function handleLogout() {
  clearSession();
  window.location.href = 'login.html';
}

/* ================================================================
   INICIALIZAÇÃO AUTOMÁTICA POR PÁGINA
   ================================================================ */

/**
 * Detecta qual página está sendo exibida e inicializa o comportamento correto.
 * - tasks.html   → verifica autenticação e carrega tarefas
 * - login.html   → redireciona se já estiver autenticado
 * - register.html → redireciona se já estiver autenticado
 */
(function init() {
  const page = window.location.pathname.split('/').pop();

  if (page === 'tasks.html') {
    /* Inicializa a página de tarefas após o DOM estar pronto */
    document.addEventListener('DOMContentLoaded', initTasksPage);

    /* Permite enviar formulários do modal com Enter */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const modal = document.getElementById('task-modal');
        if (modal && !modal.classList.contains('hidden')) {
          handleSaveTask();
        }
      }
      if (e.key === 'Escape') {
        closeModal();
        closeConfirm();
      }
    });

  } else if (page === 'login.html' || page === 'register.html' || page === '') {
    /* Se já estiver logado, não precisa ver login/registro */
    if (getToken()) {
      window.location.href = 'tasks.html';
    }

    /* Permite enviar com Enter no login e registro */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (page === 'login.html' || page === '') handleLogin();
        else handleRegister();
      }
    });
  }
})();
