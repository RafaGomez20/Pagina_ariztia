// Sistema de autenticación y control de permisos por roles
/**
 * Verifica si el usuario tiene rol de ADMIN
  @returns {boolean} true si es ADMIN, false en caso contrario
 */
const isAdmin = () => {
  const rol = sessionStorage.getItem("rol");
  return rol === "ADMIN";
};

/**
  Verifica si el usuario tiene rol de visita
  @returns {boolean} true si es visita, false en caso contrario
 */
const isVisita = () => {
  const rol = sessionStorage.getItem("rol");
  return rol === "USER";
};

/**
  Obtiene el rol actual del usuario
  @returns {string} El rol del usuario o "Sin rol" si no existe
 */
const getRol = () => {
  return sessionStorage.getItem("rol") || "Sin rol";
};

/**
  Muestra un mensaje de permiso denegado
  @param {string} mensaje - Mensaje personalizado (opcional)
 */
const showPermissionDenied = (mensaje = "No tienes permisos para realizar esta acción. Solo usuarios ADMIN pueden editar.") => {
  alert(mensaje);
};

/**
  Deshabilita elementos de edición si el usuario NO es ADMIN
  Esta función debe ejecutarse después de que el DOM esté cargado
 */
const disableEditForNonAdmin = () => {
  if (!isAdmin()) {
    
    // Deshabilitar todos los botones de agregar
    const addButtons = document.querySelectorAll('[data-action="add"], .btn-add, .btn-primario');
    addButtons.forEach(btn => {
      btn.disabled = true;
      btn.style.opacity = "0.5";
      btn.style.cursor = "not-allowed";
      btn.title = "Solo usuarios ADMIN pueden agregar datos";
    });

    // Deshabilitar todos los botones de editar
    const editButtons = document.querySelectorAll('[data-action="edit"], .btn-edit, .btn-editar');
    editButtons.forEach(btn => {
      btn.disabled = true;
      btn.style.opacity = "0.5";
      btn.style.cursor = "not-allowed";
      btn.title = "Solo usuarios ADMIN pueden editar datos";
    });

    // Deshabilitar todos los botones de eliminar
    const deleteButtons = document.querySelectorAll('[data-action="delete"], .btn-delete');
    deleteButtons.forEach(btn => {
      btn.disabled = true;
      btn.style.display = "none";
    });
  } else {
  }
};

/**
  Verifica permisos antes de abrir un modal o ejecutar una acción
  @param {Function} callback - Función a ejecutar si tiene permisos
  @returns {boolean} true si tiene permisos, false si no
 */
const verificarPermisosYEjecutar = (callback) => {
  if (!isAdmin()) {
    showPermissionDenied();
    return false;
  }
  callback();
  return true;
};

/**
  Deshabilita el botón de carga de archivos para usuarios no-ADMIN
 */
const disableUploadForNonAdmin = () => {
  if (!isAdmin()) {
    const btnUpload = document.getElementById("btnAbrirModal");
    if (btnUpload) {
      btnUpload.disabled = true;
      btnUpload.style.opacity = "0.5";
      btnUpload.style.cursor = "not-allowed";
      btnUpload.title = "Solo usuarios ADMIN pueden cargar archivos";
    }
  }
};

//Exportar funciones para uso global
window.authUtils = {
  isAdmin,
  isVisita,
  getRol,
  showPermissionDenied,
  disableEditForNonAdmin,
  verificarPermisosYEjecutar,
  disableUploadForNonAdmin
};