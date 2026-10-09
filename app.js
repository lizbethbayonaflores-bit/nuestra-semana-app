import { DAYS, CHILDREN, STORAGE_KEY, validateActivity, conflictsFor, matchesChild, readActivities, NAMES_KEY, readNames } from './schedule.js';

const $ = selector => document.querySelector(selector);
const form = $('#activity-form');
const dialog = $('#activity-dialog');
let activities = [];
let names = { ...CHILDREN };
let namesReadable = true;
try { names = readNames(localStorage); }
catch { namesReadable = false; }
let filter = 'all';
let editingId = null;
let deletingId = null;
let storageReadable = true;
try { activities = readActivities(localStorage); }
catch {
  storageReadable = false;
  $('#storage-warning').hidden = false;
  $('#storage-warning').textContent = 'No se pudieron leer tus actividades guardadas. Para protegerlas, no se sobrescribirán. Revisa el almacenamiento o usa otro navegador.';
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function displayTime(time) {
  const [hour, minute] = time.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'a. m.' : 'p. m.'}`;
}

function persist(next) {
  if (!storageReadable) return false;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
  catch {
    $('#storage-warning').hidden = false;
    $('#storage-warning').textContent = 'No se pudo guardar el cambio. El almacenamiento puede estar lleno o bloqueado. Tus actividades anteriores se mantienen; vuelve a intentarlo.';
    return false;
  }
  activities = next;
  $('#storage-warning').hidden = true;
  render();
  return true;
}

function render() {
  for (const child of ['child1', 'child2']) {
    document.querySelectorAll(`[data-name="${child}"]`).forEach(node => node.textContent = names[child]);
    $(`#${child}-avatar`).textContent = names[child].slice(0, 1).toUpperCase();
  }

  const week = $('#week');
  week.replaceChildren();

  for (const child of ['child1', 'child2']) {
    const count = activities.filter(a => matchesChild(a, child)).length;
    $(`#${child}-count`).textContent = `${count} ${count === 1 ? 'actividad' : 'actividades'} esta semana`;
  }

  const conflictCount = activities.filter(a => conflictsFor(a, activities).length).length;
  $('#conflict-summary').hidden = !conflictCount;
  $('#conflict-summary').textContent = `${conflictCount} actividades tienen cruces de horario para el mismo hijo. Revisa las tarjetas señaladas.`;

  DAYS.forEach((day, index) => {
    const column = element('section', 'day');
    column.setAttribute('aria-label', day);

    const selected = activities
      .filter(a => a.day === index && matchesChild(a, filter))
      .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));

    const heading = element('div', 'day-heading');
    heading.append(
      element('h3', '', day),
      element('span', 'day-count', String(selected.length))
    );
    column.append(heading);

    if (!selected.length) {
      column.append(element('p', 'empty', 'Un día por planear'));
    }

    selected.forEach(activity => {
      const card = element('article', `activity ${activity.child}`);

      card.append(
        element('span', 'badge', names[activity.child]),
        element('h4', '', activity.title),
        element('p', 'time', `${displayTime(activity.start)} – ${displayTime(activity.end)}`)
      );

      if (activity.location) {
        card.append(element('p', 'location', `⌖ ${activity.location}`));
      }

      if (conflictsFor(activity, activities).length) {
        card.append(element('p', 'conflict-tag', '⚠ Cruce de horario'));
      }

      const actions = element('div', 'card-actions');

      const edit = element('button', '', 'Editar');
      edit.setAttribute('aria-label', `Editar ${activity.title}`);
      edit.addEventListener('click', () => openForm(activity));

      const remove = element('button', '', 'Eliminar');
      remove.setAttribute('aria-label', `Eliminar ${activity.title}`);
      remove.addEventListener('click', () => {
        deletingId = activity.id;
        $('#delete-description').textContent = `¿Quieres eliminar «${activity.title}» del ${DAYS[activity.day].toLowerCase()}?`;
        $('#delete-dialog').showModal();
        $('#cancel-delete').focus();
      });

      actions.append(edit, remove);
      card.append(actions);
      column.append(card);
    });

    const add = element('button', 'day-add', '＋ Añadir');
    add.setAttribute('aria-label', `Añadir actividad el ${day.toLowerCase()}`);
    add.addEventListener('click', () => openForm(null, index));
    column.append(add);
    week.append(column);
  });
}

function currentActivity() {
  const data = new FormData(form);
  return {
    id: editingId || '',
    title: data.get('title').trim(),
    child: data.get('child'),
    day: Number(data.get('day')),
    start: data.get('start'),
    end: data.get('end'),
    location: data.get('location').trim()
  };
}

function showConflicts() {
  const activity = currentActivity();
  const conflicts = validateActivity(activity) ? [] : conflictsFor(activity, activities);
  $('#form-conflicts').hidden = !conflicts.length;
  $('#form-conflicts').textContent = `Cruce de horario con: ${conflicts.map(a => `${a.title} (${names[a.child]})`).join(', ')}.`;
}

function openForm(activity = null, day = 0) {
  editingId = activity?.id || null;
  form.reset();
  $('#dialog-title').textContent = activity ? 'Editar actividad' : 'Añadir actividad';
  form.elements.day.value = String(day);
  form.elements.child.value = filter === 'all' ? 'both' : filter;

  if (activity) {
    for (const key of ['title', 'child', 'day', 'start', 'end', 'location']) {
      form.elements[key].value = activity[key];
    }
  }

  $('#form-error').hidden = true;
  showConflicts();
  dialog.showModal();
  form.elements.title.focus();
}

$('#add-button').addEventListener('click', () => openForm());
$('#close-dialog').addEventListener('click', () => dialog.close());
$('#cancel-dialog').addEventListener('click', () => dialog.close());

form.addEventListener('input', showConflicts);

form.addEventListener('submit', event => {
  event.preventDefault();

  const activity = currentActivity();
  const error = validateActivity(activity);

  if (error) {
    $('#form-error').textContent = error;
    $('#form-error').hidden = false;
    return;
  }

  activity.id ||= crypto.randomUUID();

  const next = editingId
    ? activities.map(a => a.id === editingId ? activity : a)
    : [...activities, activity];

  if (persist(next)) {
    dialog.close();
    $('#status').textContent = editingId ? 'Actividad actualizada.' : 'Actividad añadida.';
  } else {
    $('#form-error').hidden = false;
    $('#form-error').textContent = 'No se guardó la actividad. Revisa el aviso de almacenamiento y vuelve a intentarlo.';
  }
});

document.querySelectorAll('[data-filter]').forEach(button => {
  button.addEventListener('click', () => {
    filter = button.dataset.filter;

    document.querySelectorAll('[data-filter]').forEach(b => {
      b.setAttribute('aria-pressed', String(b === button));
    });

    render();
  });
});

$('#cancel-delete').addEventListener('click', () => $('#delete-dialog').close());

$('#confirm-delete').addEventListener('click', () => {
  if (persist(activities.filter(a => a.id !== deletingId))) {
    $('#delete-dialog').close();
    $('#status').textContent = 'Actividad eliminada.';
  } else {
    $('#delete-description').textContent = 'No se pudo eliminar la actividad. Revisa el almacenamiento del navegador y vuelve a intentarlo.';
  }
});

render();

const namesDialog = $('#names-dialog');
const namesForm = $('#names-form');

$('#names-button').addEventListener('click', () => {
  for (const key of ['child1', 'child2']) {
    namesForm.elements[key].value = names[key];
  }

  $('#names-error').hidden = namesReadable;
  $('#names-error').textContent = namesReadable
    ? ''
    : 'No se pudieron leer los nombres guardados. No se sobrescribirán para protegerlos.';

  namesDialog.showModal();
});

$('#cancel-names').addEventListener('click', () => namesDialog.close());

namesForm.addEventListener('submit', event => {
  event.preventDefault();

  const next = {
    child1: namesForm.elements.child1.value.trim(),
    child2: namesForm.elements.child2.value.trim(),
    both: CHILDREN.both
  };

  if (!namesReadable || !next.child1 || !next.child2) {
    $('#names-error').hidden = false;
    $('#names-error').textContent = namesReadable
      ? 'Escribe un nombre para cada perfil.'
      : 'No se sobrescribirán los nombres guardados porque no se pudieron leer.';
    return;
  }

  try {
    localStorage.setItem(NAMES_KEY, JSON.stringify({
      child1: next.child1,
      child2: next.child2
    }));
  } catch {
    $('#names-error').hidden = false;
    $('#names-error').textContent = 'No se pudieron guardar los nombres. Revisa el almacenamiento del navegador.';
    return;
  }

  names = next;
  render();
  namesDialog.close();
  $('#status').textContent = 'Nombres guardados solo en este navegador.';
});
