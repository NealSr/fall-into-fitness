const supabaseConfigured = window.FITNESS_SUPABASE_URL?.includes('.supabase.co') && !window.FITNESS_SUPABASE_URL.includes('YOUR_') && !window.FITNESS_SUPABASE_ANON_KEY?.includes('YOUR_');
const supabaseClient = supabaseConfigured ? window.supabase.createClient(window.FITNESS_SUPABASE_URL, window.FITNESS_SUPABASE_ANON_KEY) : null;
let currentUser = null;

const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;
const formatDate = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
const showFeedback = (selector, message, isError = false) => { const feedback = document.querySelector(selector); feedback.textContent = message; feedback.classList.toggle('error', isError); };

const setAuthUi = (user) => {
  currentUser = user;
  const signedIn = Boolean(user);
  document.querySelector('#auth-panel').hidden = signedIn;
  document.querySelector('#auth-state').textContent = signedIn ? user.email : (supabaseConfigured ? 'Admin sign-in required' : 'Connect Supabase to begin');
  document.querySelector('#sign-out').hidden = !signedIn;
  document.querySelector('#auth-panel').classList.toggle('signed-in', signedIn);
  document.querySelector('#auth-title').textContent = signedIn ? 'Roster control is unlocked' : 'Sign in to manage the roster';
  document.querySelector('#auth-copy').textContent = signedIn ? 'Add participants, record weekly weights, and publish the latest progress report.' : 'Everyone else can simply tell you their name and weekly weight. Only the admin account can access this portal.';
  document.querySelector('#auth-form').hidden = signedIn;
  document.querySelector('.join-panel').classList.toggle('locked', !signedIn);
  document.querySelector('.update-panel').classList.toggle('locked', !signedIn);
};

const loadParticipants = async () => {
  if (!supabaseClient || !currentUser) return [];
  const { data, error } = await supabaseClient.from('participants').select('id, first_name, last_name').order('last_name');
  if (error) { showFeedback('#join-feedback', error.message, true); return []; }
  return data || [];
};

const renderStats = async () => {
  if (!supabaseClient || !currentUser) { ['#participant-count', '#checkin-count', '#group-loss'].forEach((selector) => { document.querySelector(selector).textContent = '—'; }); return; }
  const { data: roster = [] } = await supabaseClient.from('challenge_leaderboard').select('*');
  const losses = roster.map((person) => Number(person.percentage_lost));
  const average = losses.length ? losses.reduce((sum, value) => sum + value, 0) / losses.length : 0;
  const { count } = await supabaseClient.from('checkins').select('id', { count: 'exact', head: true });
  document.querySelector('#participant-count').textContent = roster.length;
  document.querySelector('#checkin-count').textContent = count || 0;
  document.querySelector('#group-loss').textContent = formatPercent(average);
};

const renderReports = async () => {
  const list = document.querySelector('#report-table');
  if (!currentUser) { list.innerHTML = '<div class="empty-state">Sign in above to view the roster report.</div>'; document.querySelector('#report-participant-count').textContent = '—'; document.querySelector('#average-loss').textContent = '—'; document.querySelector('#latest-date').textContent = '—'; return; }
  const { data: roster, error } = await supabaseClient.from('challenge_leaderboard').select('*').order('percentage_lost', { ascending: false });
  if (error) { list.innerHTML = `<div class="empty-state">${error.message}</div>`; return; }
  const people = roster || [];
  const losses = people.map((person) => Number(person.percentage_lost));
  const average = losses.length ? losses.reduce((sum, value) => sum + value, 0) / losses.length : 0;
  const latestDate = people.map((person) => person.latest_checkin).sort().at(-1);
  document.querySelector('#report-participant-count').textContent = people.length;
  document.querySelector('#average-loss').textContent = formatPercent(average);
  document.querySelector('#latest-date').textContent = formatDate(latestDate);
  if (!people.length) { list.innerHTML = '<div class="empty-state">No participants yet. Add the first person above.</div>'; return; }
  const maxLoss = Math.max(...losses, 1);
  list.innerHTML = people.map((person, index) => {
    const loss = Number(person.percentage_lost);
    return `<div class="report-row"><span class="rank">${String(index + 1).padStart(2, '0')}</span><div><div class="person-name">${person.first_name} ${person.last_name}</div><div class="person-meta">${person.latest_time_of_day.toLowerCase()} · ${formatDate(person.latest_checkin)}</div></div><div class="bar-track"><div class="bar-fill" style="width: ${Math.max(0, (loss / maxLoss) * 100)}%"></div></div><strong class="percent">${formatPercent(loss)}</strong></div>`;
  }).join('');
};

const updateSelect = async () => {
  const participants = await loadParticipants();
  document.querySelector('#participant-select').innerHTML = participants.length ? participants.map((person) => `<option value="${person.id}">${person.first_name} ${person.last_name}</option>`).join('') : '<option value="">Add a participant first</option>';
};
const refresh = async () => { await Promise.all([updateSelect(), renderStats(), renderReports()]); };

document.querySelector('#auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!supabaseClient) { showFeedback('#auth-feedback', 'Add your Supabase project values to supabase-config.js first.', true); return; }
  const form = new FormData(event.currentTarget);
  const { error } = await supabaseClient.auth.signInWithPassword({ email: form.get('email'), password: form.get('password') });
  if (error) { showFeedback('#auth-feedback', error.message, true); return; }
  showFeedback('#auth-feedback', 'Signed in.');
});

document.querySelector('#sign-out').addEventListener('click', () => supabaseClient?.auth.signOut());

document.querySelector('#join-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentUser) { showFeedback('#join-feedback', 'Sign in as the challenge admin first.', true); return; }
  const form = new FormData(event.currentTarget);
  const { data: participant, error } = await supabaseClient.from('participants').insert({ first_name: form.get('firstName'), last_name: form.get('lastName'), start_weight: Number(form.get('weight')) }).select().single();
  if (error) { showFeedback('#join-feedback', error.message, true); return; }
  const { error: checkinError } = await supabaseClient.from('checkins').insert({ participant_id: participant.id, weight: Number(form.get('weight')), time_of_day: form.get('timeOfDay') });
  if (checkinError) { showFeedback('#join-feedback', checkinError.message, true); return; }
  event.currentTarget.reset(); await refresh(); showFeedback('#join-feedback', 'Participant added to the roster.');
});

document.querySelector('#checkin-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentUser) { showFeedback('#checkin-feedback', 'Sign in as the challenge admin first.', true); return; }
  const form = new FormData(event.currentTarget);
  const { error } = await supabaseClient.from('checkins').insert({ participant_id: form.get('participant'), weight: Number(form.get('weight')), time_of_day: form.get('timeOfDay') });
  if (error) { showFeedback('#checkin-feedback', error.message, true); return; }
  event.currentTarget.reset(); await refresh(); showFeedback('#checkin-feedback', 'Weekly check-in saved.');
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
