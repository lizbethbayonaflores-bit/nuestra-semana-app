export const DAYS = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo'
];

export const IDS = ['child1', 'child2', 'adult'];

export const STATE_KEY = 'nuestra-semana.state.v2';
export const BACKUP_KEY = 'nuestra-semana.before-v2';
export const OLD_ACTIVITIES_KEY = 'nuestra-semana.activities.v1';
export const OLD_NAMES_KEY = 'nuestra-semana.names.v1';

const DEFAULTS = ['Persona 1', 'Persona 2', 'Persona 3'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function dateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addDays(date, amount) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function isDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) {
    return false;
  }

  try {
    return addDays(value, 0) === value;
  } catch {
    return false;
  }
}

export function monday(value = dateString(new Date())) {
  if (!isDate(value)) {
    throw new Error('Fecha no válida');
  }

  const weekday = new Date(`${value}T12:00:00Z`).getUTCDay();
  return addDays(value, -((weekday + 6) % 7));
}

export function validateRecord(record) {
  if (!record || typeof record !== 'object') {
    return 'Actividad no válida.';
  }

  if (typeof record.id !== 'string' || !record.id) {
    return 'Identificador no válido.';
  }

  if (
    typeof record.title !== 'string' ||
    !record.title.trim() ||
    record.title.length > 100
  ) {
    return 'Escribe un nombre de hasta 100 caracteres.';
  }

  if (
    !Array.isArray(record.people) ||
    !record.people.length ||
    new Set(record.people).size !== record.people.length ||
    record.people.some(id => !IDS.includes(id))
  ) {
    return 'Selecciona al menos una persona.';
  }

  if (
    !Array.isArray(record.days) ||
    !record.days.length ||
    new Set(record.days).size !== record.days.length ||
    record.days.some(day =>
      !Number.isInteger(day) ||
      day < 0 ||
      day > 6
    )
  ) {
    return 'Selecciona al menos un día.';
  }

  if (
    !TIME.test(record.start) ||
    !TIME.test(record.end) ||
    record.start >= record.end
  ) {
    return 'La hora de fin debe ser posterior a la de inicio.';
  }

  if (
    typeof record.location !== 'string' ||
    record.location.length > 160
  ) {
    return 'El lugar debe tener hasta 160 caracteres.';
  }

  if (
    typeof record.weekly !== 'boolean' ||
    !isDate(record.week) ||
    monday(record.week) !== record.week
  ) {
    return 'Semana no válida.';
  }

  if (
    !Array.isArray(record.excluded) ||
    record.excluded.some(date => !isDate(date))
  ) {
    return 'Excepciones no válidas.';
  }

  return '';
}

export function validateState(state) {
  if (
    !state ||
    state.version !== 2 ||
    !Array.isArray(state.profiles) ||
    state.profiles.length !== 3 ||
    !Array.isArray(state.activities)
  ) {
    throw new Error('Formato no válido');
  }

  for (const [index, profile] of state.profiles.entries()) {
    if (
      !profile ||
      profile.id !== IDS[index] ||
      typeof profile.name !== 'string' ||
      !profile.name.trim() ||
      profile.name.length > 40
    ) {
      throw new Error('Perfiles no válidos');
    }
  }

  if (
    state.activities.some(record => validateRecord(record)) ||
    new Set(state.activities.map(record => record.id)).size !==
      state.activities.length
  ) {
    throw new Error('Actividades no válidas');
  }

  return state;
}

export function migrateLegacy(
  activitiesRaw,
  namesRaw,
  week = monday()
) {
  const old = activitiesRaw === null
    ? []
    : JSON.parse(activitiesRaw);

  const names = namesRaw === null
    ? null
    : JSON.parse(namesRaw);

  if (!Array.isArray(old)) {
    throw new Error('No se pueden leer las actividades anteriores');
  }

  if (
    names !== null &&
    (
      !names ||
      ['child1', 'child2'].some(id =>
        typeof names[id] !== 'string' ||
        !names[id].trim() ||
        names[id].length > 40
      )
    )
  ) {
    throw new Error('No se pueden leer los nombres anteriores');
  }

  const activities = old.map(activity => {
    if (
      !activity ||
      !['child1', 'child2', 'both'].includes(activity.child) ||
      !Number.isInteger(activity.day)
    ) {
      throw new Error('Actividad anterior no válida');
    }

    return {
      id: activity.id,
      title: activity.title,
      people: activity.child === 'both'
        ? ['child1', 'child2']
        : [activity.child],
      days: [activity.day],
      start: activity.start,
      end: activity.end,
      location: activity.location,
      weekly: true,
      week,
      excluded: []
    };
  });

  return validateState({
    version: 2,
    profiles: IDS.map((id, index) => ({
      id,
      name: names && index < 2
        ? names[id]
        : DEFAULTS[index]
    })),
    activities
  });
}

export function loadState(storage, week = monday()) {
  const raw = storage.getItem(STATE_KEY);

  return raw !== null
    ? validateState(JSON.parse(raw))
    : migrateLegacy(
        storage.getItem(OLD_ACTIVITIES_KEY),
        storage.getItem(OLD_NAMES_KEY),
        week
      );
}

export function saveState(storage, state) {
  validateState(state);

  // Conserva literalmente el almacenamiento anterior.
  // Nunca lo borra ni lo reescribe.
  if (storage.getItem(BACKUP_KEY) === null) {
    storage.setItem(
      BACKUP_KEY,
      JSON.stringify({
        version: 1,
        previousState: storage.getItem(STATE_KEY),
        activities: storage.getItem(OLD_ACTIVITIES_KEY),
        names: storage.getItem(OLD_NAMES_KEY)
      })
    );
  }

  storage.setItem(STATE_KEY, JSON.stringify(state));
}

export function occurrences(state, week) {
  return state.activities.flatMap(record => {
    if (
      record.weekly
        ? week < record.week
        : week !== record.week
    ) {
      return [];
    }

    return record.days.flatMap(day => {
      const date = addDays(week, day);

      return record.excluded.includes(date)
        ? []
        : [{
            ...record,
            day,
            date,
            key: `${record.id}/${date}`
          }];
    });
  });
}

export function overlaps(a, b) {
  return (
    a.date === b.date &&
    a.start < b.end &&
    b.start < a.end &&
    a.people.some(person => b.people.includes(person))
  );
}

export function conflictsFor(activity, visible) {
  return visible.filter(other =>
    other.key !== activity.key &&
    overlaps(activity, other)
  );
}

export function matchesPerson(activity, filter) {
  return (
    filter === 'all' ||
    activity.people.includes(filter)
  );
}

export function removeOccurrence(
  state,
  occurrence,
  scope = 'single'
) {
  if (scope === 'series') {
    return {
      ...state,
      activities: state.activities.filter(record =>
        record.id !== occurrence.id
      )
    };
  }

  return {
    ...state,
    activities: state.activities.flatMap(record => {
      if (record.id !== occurrence.id) {
        return [record];
      }

      const updated = {
        ...record,
        excluded: [
          ...new Set([
            ...record.excluded,
            occurrence.date
          ])
        ]
      };

      return (
        !updated.weekly &&
        updated.days.every(day =>
          updated.excluded.includes(
            addDays(updated.week, day)
          )
        )
      )
        ? []
        : [updated];
    })
  };
}

export function editOccurrence(
  state,
  occurrence,
  replacement,
  scope = 'single'
) {
  if (scope === 'series') {
    const original = state.activities.find(record =>
      record.id === occurrence.id
    );

    if (!original) {
      throw new Error('La serie ya no existe');
    }

    return {
      ...state,
      activities: state.activities.map(record =>
        record.id === original.id
          ? {
              ...replacement,
              id: original.id,
              excluded: original.excluded,
              week: replacement.weekly && original.weekly
                ? original.week
                : replacement.week
            }
          : record
      )
    };
  }

  const without = removeOccurrence(state, occurrence);

  return {
    ...without,
    activities: [
      ...without.activities,
      replacement
    ]
  };
}

export function backupText(storage) {
  // Puede ejecutarse aun con datos dañados,
  // para no impedir su recuperación.
  return JSON.stringify(
    {
      format: 'nuestra-semana-backup',
      version: 1,
      state: storage.getItem(STATE_KEY),
      activities: storage.getItem(OLD_ACTIVITIES_KEY),
      names: storage.getItem(OLD_NAMES_KEY)
    },
    null,
    2
  );
}

export function restoreText(text, week = monday()) {
  const backup = JSON.parse(text);

  if (
    backup?.format !== 'nuestra-semana-backup' ||
    backup.version !== 1
  ) {
    throw new Error('Copia no válida');
  }

  for (const key of ['state', 'activities', 'names']) {
    if (
      backup[key] !== null &&
      typeof backup[key] !== 'string'
    ) {
      throw new Error('Copia no válida');
    }
  }

  return backup.state !== null
    ? validateState(JSON.parse(backup.state))
    : migrateLegacy(
        backup.activities,
        backup.names,
        week
      );
}
