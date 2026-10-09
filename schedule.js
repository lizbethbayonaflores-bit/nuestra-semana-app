export const DAYS = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo'
];

export const STORAGE_KEY = 'nuestra-semana.activities.v1';

export const CHILDREN = {
  child1: 'Hijo 1',
  child2: 'Hijo 2',
  both: 'Ambos hijos'
};

export const NAMES_KEY = 'nuestra-semana.names.v1';

export function readNames(storage) {
  const raw = storage.getItem(NAMES_KEY);

  if (raw === null) {
    return { ...CHILDREN };
  }

  const names = JSON.parse(raw);

  if (
    !names ||
    ['child1', 'child2'].some(key =>
      typeof names[key] !== 'string' ||
      !names[key].trim() ||
      names[key].length > 40
    )
  ) {
    throw new Error('Nombres no válidos');
  }

  return {
    child1: names.child1,
    child2: names.child2,
    both: CHILDREN.both
  };
}

export function validateActivity(activity) {
  if (!activity || typeof activity !== 'object') {
    return 'La actividad no es válida.';
  }

  if (
    typeof activity.title !== 'string' ||
    !activity.title.trim() ||
    activity.title.length > 100
  ) {
    return 'Escribe un nombre de hasta 100 caracteres.';
  }

  if (
    !Number.isInteger(activity.day) ||
    activity.day < 0 ||
    activity.day > 6
  ) {
    return 'Selecciona un día válido.';
  }

  if (!Object.hasOwn(CHILDREN, activity.child)) {
    return 'Selecciona a quién corresponde la actividad.';
  }

  const time = /^([01]\d|2[0-3]):[0-5]\d$/;

  if (!time.test(activity.start) || !time.test(activity.end)) {
    return 'Introduce horas válidas.';
  }

  if (activity.start >= activity.end) {
    return 'La hora de fin debe ser posterior a la de inicio.';
  }

  if (
    typeof activity.location !== 'string' ||
    activity.location.length > 160
  ) {
    return 'El lugar debe tener hasta 160 caracteres.';
  }

  return '';
}

export function overlaps(a, b) {
  return (
    a.day === b.day &&
    a.start < b.end &&
    b.start < a.end &&
    (
      a.child === 'both' ||
      b.child === 'both' ||
      a.child === b.child
    )
  );
}

export function conflictsFor(activity, activities) {
  return activities.filter(other =>
    other.id !== activity.id &&
    overlaps(activity, other)
  );
}

export function matchesChild(activity, filter) {
  return (
    filter === 'all' ||
    activity.child === filter ||
    activity.child === 'both'
  );
}

export function readActivities(storage) {
  const raw = storage.getItem(STORAGE_KEY);

  if (raw === null) {
    return [];
  }

  const activities = JSON.parse(raw);

  if (
    !Array.isArray(activities) ||
    activities.some(a =>
      validateActivity(a) ||
      typeof a.id !== 'string' ||
      !a.id
    )
  ) {
    throw new Error('Datos guardados no válidos');
  }

  if (
    new Set(activities.map(a => a.id)).size !== activities.length
  ) {
    throw new Error('Identificadores duplicados');
  }

  return activities;
}
