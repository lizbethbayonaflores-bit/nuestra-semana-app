import {
  DAYS,
  IDS,
  monday,
  addDays,
  loadState,
  saveState,
  occurrences,
  validateRecord,
  conflictsFor,
  matchesPerson,
  removeOccurrence,
  editOccurrence,
  backupText,
  restoreText
} from './schedule.js';

const $ = selector => document.querySelector(selector);
const form = $('#activity-form');
const dialog = $('#activity-dialog');

let week = monday();
let state;
let readable = true;
let filter = 'all';
let editing = null;
let duplicating = false;
let deleting = null;

try {
  state = loadState(localStorage, week);
} catch {
  readable = false;
  state = {
    version: 2,
    profiles: IDS.map((id, index) => ({
      id,
      name: `Persona ${index + 1}`
    })),
    activities: []
  };

  $('#storage-warning').hidden = false;
  $('#storage-warning').textContent =
    'No se pudieron leer tus datos. No se sobrescribirán. Puedes usar «Copia de seguridad» para conservar el texto original antes de recuperar los datos.';
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function name(id) {
  return state.profiles.find(profile => profile.id === id)?.name || 'Persona';
}

function timeText(time) {
  const [hour, minute] = time.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'a. m.' : 'p. m.'}`;
}

function dateText(date) {
  return new Intl.DateTimeFormat('es', {
    day: 'numeric',
    month: 'short'
  }).format(new Date(`${date}T12:00:00`));
}

function commit(next, allowRecovery = false) {
  if (!readable && !allowRecovery) return false;

  try {
    saveState(localStorage, next);
  } catch {
    $('#storage-warning').hidden = false;
    $('#storage-warning').textContent =
      'No se pudo guardar. Tus datos anteriores se mantienen. Revisa si el navegador bloquea el almacenamiento o no tiene espacio.';
    return false;
  }

  state = next;
  readable = true;
  $('#storage-warning').hidden = true;
  render();
  return true;
}

function checkbox(container, field, value, labelText) {
  const label = element('label', 'check-label');
  const input = element('input');

  input.type = 'checkbox';
  input.name = field;
  input.value = String(value);

  const labelNode = element('span', '', labelText);
  if (field === 'people') labelNode.dataset.name = value;

  label.append(input, labelNode);
  container.append(label);
}

IDS.forEach(id => {
  checkbox($('#people-options'), 'people', id, name(id));
});

DAYS.forEach((day, index) => {
  checkbox($('#day-options'), 'days', index, day);
});

function setChecked(field, values) {
  form.querySelectorAll(`[name="${field}"]`).forEach(input => {
    input.checked = values.map(String).includes(input.value);
  });
}

function render() {
  IDS.forEach(id => {
    document.querySelectorAll(`[data-name="${id}"]`).forEach(node => {
      node.textContent = name(id);
    });

    $(`#${id}-avatar`).textContent = [...name(id)][0].toUpperCase();
  });

  $('#week-label').textContent =
    `${dateText(week)} – ${dateText(addDays(week, 6))} · ${week.slice(0, 4)}`;

  const visible = occurrences(state, week);

  IDS.forEach(id => {
    const count = visible.filter(activity => activity.people.includes(id)).length;
    $(`#${id}-count`).textContent =
      `${count} ${count === 1 ? 'actividad' : 'actividades'} esta semana`;
  });

  const conflicts = visible.filter(activity =>
    conflictsFor(activity, visible).length
  ).length;

  $('#conflict-summary').hidden = !conflicts;
  $('#conflict-summary').textContent =
    `${conflicts} actividades tienen cruces para al menos una persona. Revisa las tarjetas señaladas.`;

  $('#week').replaceChildren();

  DAYS.forEach((day, index) => {
    const column = element('section', 'day');
    column.setAttribute('aria-label', day);

    const selected = visible
      .filter(activity =>
        activity.day === index &&
        matchesPerson(activity, filter)
      )
      .sort((a, b) =>
        a.start.localeCompare(b.start) ||
        a.title.localeCompare(b.title)
      );

    const heading = element('div', 'day-heading');
    heading.append(
      element('h3', '', day),
      element('span', 'day-count', String(selected.length))
    );

    column.append(
      heading,
      element('span', 'series-tag', dateText(addDays(week, index)))
    );

    if (!selected.length) {
      column.append(element('p', 'empty', 'Un día por planear'));
    }

    selected.forEach(activity => {
      const card = element(
        'article',
        `activity ${activity.people.length === 1 ? activity.people[0] : 'both'}`
      );

      card.append(
        element('span', 'badge', activity.people.map(name).join(' · ')),
        element('h4', '', activity.title),
        element(
          'p',
          'time',
          `${timeText(activity.start)} – ${timeText(activity.end)}`
        )
      );

      if (activity.location) {
        card.append(element('p', 'location', `⌖ ${activity.location}`));
      }

      if (activity.weekly) {
        card.append(element('p', 'series-tag', '↻ Repetición semanal'));
      }

      if (conflictsFor(activity, visible).length) {
        card.append(element('p', 'conflict-tag', '⚠ Cruce de horario'));
      }

      const actions = element('div', 'card-actions');

      const edit = element('button', '', 'Editar');
      edit.setAttribute('aria-label', `Editar ${activity.title}`);
      edit.addEventListener('click', () => openForm(activity));

      const duplicate = element('button', '', 'Duplicar');
      duplicate.setAttribute(
        'aria-label',
        `Duplicar actividad ${activity.title}`
      );
      duplicate.addEventListener('click', () => {
        openForm(activity, index, true);
      });

      const remove = element('button', '', 'Eliminar');
      remove.setAttribute('aria-label', `Eliminar ${activity.title}`);
      remove.addEventListener('click', () => {
        deleting = activity;

        $('#delete-description').textContent =
          `¿Eliminar «${activity.title}» del ${dateText(activity.date)}?`;

        $('#delete-scope-label').hidden =
          !activity.weekly && activity.days.length === 1;

        $('#delete-scope').value = 'single';
        $('#delete-dialog').showModal();
        $('#cancel-delete').focus();
      });

      actions.append(edit, duplicate, remove);
      card.append(actions);
      column.append(card);
    });

    const add = element('button', 'day-add', '＋ Añadir');
    add.setAttribute(
      'aria-label',
      `Añadir actividad el ${day.toLowerCase()}`
    );
    add.addEventListener('click', () => openForm(null, index));

    column.append(add);
    $('#week').append(column);
  });
}

function applyScope() {
  if (!editing || duplicating) return;

  const series = form.elements.scope.value === 'series';
  setChecked('days', series ? editing.days : [editing.day]);
  form.elements.weekly.checked = series && editing.weekly;
}

function openForm(activity = null, day = 0, duplicate = false) {
  editing = activity;
  duplicating = duplicate;

  form.reset();
  form.elements.scope.value = 'single';

  $('#dialog-title').textContent = duplicate
    ? 'Duplicar actividad'
    : activity
      ? 'Editar actividad'
      : 'Añadir actividad';

  $('#edit-scope-label').hidden =
    !activity ||
    duplicate ||
    (!activity.weekly && activity.days.length === 1);

  setChecked(
    'people',
    activity
      ? activity.people
      : filter === 'all'
        ? ['child1', 'child2']
        : [filter]
  );

  setChecked(
    'days',
    duplicate ? [] : [activity ? activity.day : day]
  );

  if (activity) {
    for (const field of ['title', 'start', 'end', 'location']) {
      form.elements[field].value = activity[field];
    }
  }

  form.elements.weekly.checked = duplicate && activity.weekly;
  $('#form-error').hidden = true;

  showConflicts();
  dialog.showModal();
  form.elements.title.focus();
}

function currentRecord() {
  const data = new FormData(form);

  return {
    id: 'draft',
    title: data.get('title').trim(),
    people: data.getAll('people'),
    days: data.getAll('days').map(Number),
    start: data.get('start'),
    end: data.get('end'),
    location: data.get('location').trim(),
    weekly: form.elements.weekly.checked,
    week,
    excluded: []
  };
}

function proposed(next, id) {
  const record = { ...next, id };

  if (editing && !duplicating) {
    return editOccurrence(
      state,
      editing,
      record,
      form.elements.scope.value
    );
  }

  return {
    ...state,
    activities: [...state.activities, record]
  };
}

function showConflicts() {
  const record = currentRecord();

  if (validateRecord(record)) {
    $('#form-conflicts').hidden = true;
    return;
  }

  // Previsualiza el resultado sin contar como cruce
  // la actividad que se reemplaza.
  const next = proposed(record, 'preview-draft');

  const id = editing &&
    !duplicating &&
    form.elements.scope.value === 'series'
      ? editing.id
      : 'preview-draft';

  const current = occurrences(next, week);

  const titles = new Set(
    current
      .filter(activity => activity.id === id)
      .flatMap(activity =>
        conflictsFor(activity, current).map(other => other.title)
      )
  );

  $('#form-conflicts').hidden = !titles.size;
  $('#form-conflicts').textContent =
    `Cruce en esta semana con: ${[...titles].join(', ')}. Las semanas futuras pueden tener otros cruces.`;
}

form.elements.scope.addEventListener('change', () => {
  applyScope();
  showConflicts();
});

form.addEventListener('input', showConflicts);

$('#both-children').addEventListener('click', () => {
  setChecked('people', ['child1', 'child2']);
  showConflicts();
});

$('#add-button').addEventListener('click', () => openForm());
$('#close-dialog').addEventListener('click', () => dialog.close());
$('#cancel-dialog').addEventListener('click', () => dialog.close());

form.addEventListener('submit', event => {
  event.preventDefault();

  const record = currentRecord();
  const error = validateRecord(record);

  if (error) {
    $('#form-error').hidden = false;
    $('#form-error').textContent = error;
    return;
  }

  if (commit(proposed(record, crypto.randomUUID()))) {
    dialog.close();
    $('#status').textContent = duplicating
      ? 'Actividad duplicada.'
      : editing
        ? 'Actividad actualizada.'
        : 'Actividad añadida.';
  } else {
    $('#form-error').hidden = false;
    $('#form-error').textContent =
      'No se guardó el cambio. Revisa el aviso de almacenamiento.';
  }
});

document.querySelectorAll('[data-filter]').forEach(button => {
  button.addEventListener('click', () => {
    filter = button.dataset.filter;

    document.querySelectorAll('[data-filter]').forEach(other => {
      other.setAttribute('aria-pressed', String(other === button));
    });

    render();
  });
});

$('#previous-week').addEventListener('click', () => {
  week = addDays(week, -7);
  render();
});

$('#next-week').addEventListener('click', () => {
  week = addDays(week, 7);
  render();
});

$('#current-week').addEventListener('click', () => {
  week = monday();
  render();
});

$('#cancel-delete').addEventListener('click', () => {
  $('#delete-dialog').close();
});

$('#confirm-delete').addEventListener('click', () => {
  if (commit(removeOccurrence(state, deleting, $('#delete-scope').value))) {
    $('#delete-dialog').close();
    $('#status').textContent = 'Actividad eliminada.';
  } else {
    $('#delete-description').textContent =
      'No se pudo guardar la eliminación. Tus datos anteriores se mantienen.';
  }
});

const namesForm = $('#names-form');

$('#names-button').addEventListener('click', () => {
  IDS.forEach(id => {
    namesForm.elements[id].value = name(id);
  });

  $('#names-error').hidden = readable;
  $('#names-error').textContent = readable
    ? ''
    : 'No se sobrescribirán los datos porque no se pudieron leer.';

  $('#names-dialog').showModal();
});

$('#cancel-names').addEventListener('click', () => {
  $('#names-dialog').close();
});

namesForm.addEventListener('submit', event => {
  event.preventDefault();

  const profiles = IDS.map(id => ({
    id,
    name: namesForm.elements[id].value.trim()
  }));

  if (profiles.some(profile => !profile.name || profile.name.length > 40)) {
    $('#names-error').hidden = false;
    $('#names-error').textContent =
      'Escribe nombres de hasta 40 caracteres.';
    return;
  }

  if (commit({ ...state, profiles })) {
    $('#names-dialog').close();
    $('#status').textContent =
      'Nombres guardados solo en este navegador.';
  } else {
    $('#names-error').hidden = false;
    $('#names-error').textContent =
      'No se pudieron guardar los nombres. Tus datos anteriores se mantienen.';
  }
});

$('#backup-button').addEventListener('click', () => {
  try {
    $('#backup-output').value = backupText(localStorage);
    $('#backup-status').textContent = '';
  } catch {
    $('#backup-output').value = '';
    $('#backup-status').textContent =
      'El navegador bloquea el acceso al almacenamiento.';
  }

  $('#backup-input').value = '';
  $('#backup-dialog').showModal();
});

$('#close-backup').addEventListener('click', () => {
  $('#backup-dialog').close();
});

$('#copy-backup').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#backup-output').value);
    $('#backup-status').textContent =
      'Texto copiado. Guárdalo en una nota privada.';
  } catch {
    $('#backup-output').focus();
    $('#backup-output').select();
    $('#backup-status').textContent =
      'Texto seleccionado: usa la opción Copiar de tu navegador y guárdalo en una nota privada.';
  }
});

$('#restore-backup').addEventListener('click', () => {
  try {
    const next = restoreText($('#backup-input').value, week);

    if (!confirm(
      '¿Reemplazar tus nombres y actividades actuales por esta copia? Guarda primero una copia de tus datos actuales.'
    )) {
      return;
    }

    if (!commit(next, true)) {
      throw new Error('No se pudo guardar');
    }

    $('#backup-output').value = backupText(localStorage);
    $('#backup-status').textContent = 'Copia restaurada.';
  } catch {
    $('#backup-status').textContent =
      'No se restauró la copia. Comprueba el texto y el almacenamiento. Tus datos anteriores se mantienen.';
  }
});

render();
