// Validación de formularios en el cliente, con mensajes en español y accesibles.
// Las reglas replican las del backend para prevenir errores; el backend sigue siendo la autoridad.
// Reglas por atributos HTML: required, type="email", data-rule="phone", min, max, data-integer,
// minlength, maxlength.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+()\-\s.]{7,25}$/;

function fieldLabel(field) {
  const label = field.id ? document.querySelector(`label[for="${field.id}"]`) : null;
  return (label?.dataset.name || label?.textContent || 'Este campo').replace('*', '').trim();
}

function messageFor(field) {
  const value = field.value.trim();
  const name = fieldLabel(field);
  if (field.required && !value) return `${name} es obligatorio.`;
  if (!value) return '';
  if (field.type === 'email' && !EMAIL_RE.test(value)) return 'Escribe un correo válido, por ejemplo: nombre@negocio.com';
  if (field.dataset.rule === 'phone') {
    if (!PHONE_RE.test(value) || value.replace(/\D/g, '').length < 7) {
      return 'Escribe un teléfono válido (7 a 25 caracteres; solo números, espacios, +, - y paréntesis).';
    }
  }
  if (field.type === 'number') {
    const number = Number(value);
    if (!Number.isFinite(number)) return `${name} debe ser un número.`;
    if ('integer' in field.dataset && !Number.isInteger(number)) return `${name} debe ser un número entero.`;
    if (field.min !== '' && number < Number(field.min)) {
      return Number(field.min) > 0 ? `${name} debe ser mayor o igual a ${field.min}.` : `${name} no puede ser negativo.`;
    }
    if (field.max !== '' && number > Number(field.max)) return `${name} no puede ser mayor a ${field.max}.`;
  }
  const min = Number(field.getAttribute('minlength'));
  if (min && value.length < min) return `${name} debe tener al menos ${min} caracteres.`;
  const max = Number(field.getAttribute('maxlength'));
  if (max && value.length > max) return `${name} admite como máximo ${max} caracteres.`;
  return '';
}

function feedbackFor(field) {
  const id = `${field.id}-error`;
  let feedback = document.getElementById(id);
  if (!feedback) {
    feedback = document.createElement('div');
    feedback.id = id;
    feedback.className = 'invalid-feedback';
    const anchor = field.closest('.input-icon, .input-group') || field;
    anchor.insertAdjacentElement('afterend', feedback);
  }
  return feedback;
}

export function setFieldError(field, message) {
  const feedback = feedbackFor(field);
  const describedBy = new Set((field.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
  if (message) {
    field.classList.add('is-invalid');
    field.setAttribute('aria-invalid', 'true');
    feedback.textContent = message;
    feedback.classList.add('d-block');
    describedBy.add(feedback.id);
  } else {
    field.classList.remove('is-invalid');
    field.removeAttribute('aria-invalid');
    feedback.textContent = '';
    feedback.classList.remove('d-block');
    describedBy.delete(feedback.id);
  }
  if (describedBy.size) field.setAttribute('aria-describedby', [...describedBy].join(' '));
  else field.removeAttribute('aria-describedby');
}

export function validateField(field) {
  const message = messageFor(field);
  setFieldError(field, message);
  return !message;
}

/** Valida todos los campos del formulario; enfoca el primero inválido. */
export function validateForm(form) {
  const fields = [...form.querySelectorAll('input, select, textarea')].filter((f) => f.id && !f.disabled && f.type !== 'hidden');
  let first = null;
  for (const field of fields) {
    if (!validateField(field) && !first) first = field;
  }
  first?.focus();
  return !first;
}

export function clearValidation(form) {
  form.querySelectorAll('.is-invalid').forEach((field) => setFieldError(field, ''));
}

/** Revalida en vivo los campos que ya se marcaron como inválidos. */
export function liveValidation(form) {
  form.setAttribute('novalidate', '');
  form.addEventListener('input', (event) => {
    if (event.target.classList?.contains('is-invalid')) validateField(event.target);
  });
  form.addEventListener('focusout', (event) => {
    const field = event.target;
    if (field.id && field.value && (field.matches('input, textarea, select'))) validateField(field);
  });
}
