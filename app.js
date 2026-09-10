const supabaseConfigured = window.FITNESS_SUPABASE_URL?.includes('.supabase.co') && !window.FITNESS_SUPABASE_URL.includes('YOUR_') && !window.FITNESS_SUPABASE_ANON_KEY?.includes('YOUR_');
const supabaseClient = supabaseConfigured ? window.supabase.createClient(window.FITNESS_SUPABASE_URL, window.FITNESS_SUPABASE_ANON_KEY) : null;
let currentUser = null;
let authMode = 'signin';

const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;
const formatDate = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
const showFeedback = (selector, message, isError = false) => { const feedback = document.querySelector(selector); feedback.textContent = message; feedback.classList.toggle('error', isError); };

const setAuthUi = (user) => {
  currentUser = user;
  const authPanel = document.querySelector('#auth-panel');
  document.querySelector('#auth-state').textContent = user ? user.email : (supabaseConfigured ? 'Not signed in' : 'Connect Supabase to begin');
  document.querySelector('#sign-out').hidden = !user;
  authPanel.classList.toggle('signed-in', Boolean(user));
  document.querySelector('#auth-title').textContent = user ? 'You are signed in' : 'Sign in to save your check-ins';
  document.querySelector('#auth-copy').textContent = user ? 'Your check-ins are connected to your account and will follow you across devices.' : 'Reports are public. Your participant record and weight history are only available to you.';
  document.querySelector('#auth-form').hidden = Boolean(user);
  document.querySelector('.join-panel').classList.toggle('locked', !user);
  document.querySelector('.update-panel').classList.toggle('locked', !user);
};

const getOwnedParticipant = async () => {
  if (!supabaseClient || !currentUser) return null;
  const { data } = await supabaseClient.from('participants').select('id, first_name, last_name, start_weight').eq('user_id', currentUser.id).maybeSingle();
  return data;
};

const renderStats = async () => {
  if (!supabaseClient) return;
  const { data: roster = [] } = await supabaseClient.from('challenge_leaderboard').select('*');
  const losses = roster.map((person) => Number(person.percentage_lost));
  const average = losses.length ? losses.reduce((sum, value) => sum + value, 0) / losses.length : 0;
  document.querySelector('#participant-count').textContent = roster.length;
  document.querySelector('#group-loss').textContent = formatPercent(average);
  const participant = await getOwnedParticipant();
  if (!participant) { document.querySelector('#checkin-count').textContent = '0'; return; }
  const { count } = await supabaseClient.from('checkins').select('id', { count: 'exact', head: true }).eq('participant_id', participant.id);
  document.querySelector('#checkin-count').textContent = count || 0;
};

const renderReports = async () => {
  const list = document.querySelector('#report-table');
  if (!supabaseClient) { list.innerHTML = '<div class="empty-state">Add your Supabase keys in supabase-config.js to connect the roster.</div>'; return; }
  const { data: roster, error } = await supabaseClient.from('challenge_leaderboard').select('*').order('percentage_lost', { ascending: false });
  if (error) { list.innerHTML = `<div class="empty-state">${error.message}</div>`; return; }
  const people = roster || [];
  const losses = people.map((person) => Number(person.percentage_lost));
  const average = losses.length ? losses.reduce((sum, value) => sum + value, 0) / losses.length : 0;
  const latestDate = people.map((person) => person.latest_checkin).sort().at(-1);
  document.querySelector('#report-participant-count').textContent = people.length;
  document.querySelector('#average-loss').textContent = formatPercent(average);
  document.querySelector('#latest-date').textContent = formatDate(latestDate);
  if (!people.length) { list.innerHTML = '<div class="empty-state">No participants yet. Be the first to join.</div>'; return; }
  const maxLoss = Math.max(...losses, 1);
  list.innerHTML = people.map((person, index) => {
    const loss = Number(person.percentage_lost);
    const width = Math.max(0, (loss / maxLoss) * 100);
    return `<div class="report-row"><span class="rank">${String(index + 1).padStart(2, '0')}</span><div><div class="person-name">${person.first_name} ${person.last_name}</div><div class="person-meta">${person.latest_time_of_day.toLowerCase()} · ${formatDate(person.latest_checkin)}</div></div><div class="bar-track"><div class="bar-fill" style="width: ${width}%"></div></div><strong class="percent">${formatPercent(loss)}</strong></div>`;
  }).join('');
};

const updateSelect = async () => {
  const select = document.querySelector('#participant-select');
  const participant = await getOwnedParticipant();
  select.innerHTML = participant ? `<option value="${participant.id}">${participant.first_name} ${participant.last_name}</option>` : '<option value="">Join the challenge first</option>';
};
const refresh = async () => { await Promise.all([updateSelect(), renderStats(), renderReports()]); };

 document.querySelector('#auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!supabaseClient) { showFeedback('#auth-feedback', 'Add your Supabase project values to supabase-config.js first.', true); return; }
  const form = new FormData(event.currentTarget);
  const credentials = { email: form.get('email'), password: form.get('password') };
  const result = authMode === 'signin' ? await supabaseClient.auth.signInWithPassword(credentials) : await supabaseClient.auth.signUp(credentials);
  if (result.error) { showFeedback('#auth-feedback', result.error.message, true); return; }
  showFeedback('#auth-feedback', authMode === 'signin' ? 'Signed in.' : 'Account created. Check your email if confirmation is enabled.');
});

document.querySelector('#auth-mode').addEventListener('click', () => {
  authMode = authMode === 'signin' ? 'signup' : 'signin';
  document.querySelector('#auth-submit').firstChild.textContent = authMode === 'signin' ? 'Sign in ' : 'Create account ';
  document.querySelector('#auth-mode').textContent = authMode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in';
});
document.querySelector('#sign-out').addEventListener('click', () => supabaseClient?.auth.signOut());

document.querySelector('#join-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentUser) { showFeedback('#join-feedback', 'Sign in before joining the challenge.', true); return; }
  const form = new FormData(event.currentTarget);
  const { data: participant, error } = await supabaseClient.from('participants').insert({ user_id: currentUser.id, first_name: form.get('firstName'), last_name: form.get('lastName'), start_weight: Number(form.get('weight')) }).select().single();
  if (error) { showFeedback('#join-feedback', error.message, true); return; }
  const { error: checkinError } = await supabaseClient.from('checkins').insert({ participant_id: participant.id, weight: Number(form.get('weight')), time_of_day: form.get('timeOfDay') });
  if (checkinError) { showFeedback('#join-feedback', checkinError.message, true); return; }
  event.currentTarget.reset(); await refresh(); showFeedback('#join-feedback', 'You are on the roster. Nice beginning.');
});

document.querySelector('#checkin-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentUser) { showFeedback('#checkin-feedback', 'Sign in before saving a check-in.', true); return; }
  const form = new FormData(event.currentTarget);
  const { error } = await supabaseClient.from('checkins').insert({ participant_id: form.get('participant'), weight: Number(form.get('weight')), time_of_day: form.get('timeOfDay') });
  if (error) { showFeedback('#checkin-feedback', error.message, true); return; }
  event.currentTarget.reset(); await refresh(); showFeedback('#checkin-feedback', 'Check-in saved. Keep going.');
});

document.querySelectorAll('[data-view-link]').forEach((link) => link.addEventListener('click', async () => {
  const target = link.dataset.viewLink;
  document.querySelectorAll('[data-view]').forEach((view) => { view.hidden = view.dataset.view !== target; });
  document.querySelectorAll('[data-view-link]').forEach((navLink) => navLink.classList.toggle('active', navLink === link));
  await refresh();
}));

const initialView = window.location.hash === '#reports' ? 'reports' : 'checkin';
document.querySelector(`[data-view-link="${initialView}"]`).classList.add('active');
document.querySelectorAll('[data-view]').forEach((view) => { view.hidden = view.dataset.view !== initialView; });
setAuthUi(null);
if (supabaseClient) {
  supabaseClient.auth.getSession().then(({ data: { session } }) => { setAuthUi(session?.user || null); refresh(); });
  supabaseClient.auth.onAuthStateChange((_event, session) => { setAuthUi(session?.user || null); refresh(); });
} else { refresh(); }
