const url = "https://apimedidores.apidev.info/ariztia/login_app_ssgg";

//nombre de la aplicacion
const NAMEAPP = "APP-DASHBOARD_SSGG";

//funcion asincrona que hace la peticion de login a la API
const loginFetch = async (USER, PASSWORD) => {
  try {
    //se hace un fetch POST a la API de login
    const query = await fetch(url, {
      method: 'POST',
      headers: {
        'authorization': "paico2021",
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ USER, PASSWORD, NAMEAPP })
    });

    //convertimos la respuesta de la API en JSON
    const responsito = await query.json();

    //si la API responde con exito
    if (responsito.success) {
      //guardamos el rol en sessionStorage (IMPORTANTE: exactamente como viene de la API)
      sessionStorage.setItem("rol", responsito.data.ROL);

      //guardamos los datos del usuario en sessionStorage
      sessionStorage.setItem("user", responsito.data.NAME);
      sessionStorage.setItem("empresa", responsito.data.EMPRESA);

      //redirigimos al index
      window.location.href = "index.html";
    } else {
      //si la API responde error, mostramos el mensaje en pantalla
      document.getElementById("message").textContent = responsito.data.error;
      document.getElementById("message").classList.add("text-red-500");
    }
  } catch (error) {
    //si ocurre un error en la conexion o en el fetch, lo mostramos
    console.error("Error al traer datos:", error);
    document.getElementById("message").textContent = "Error de conexion con el servidor";
    document.getElementById("message").classList.add("text-red-500");
  }
};

//evento que se activa al enviar el formulario de login
document.getElementById("loginForm").addEventListener("submit", function (e) {
  e.preventDefault();

  const USER = document.getElementById("user").value;
  const PASSWORD = document.getElementById("password").value;

  loginFetch(USER, PASSWORD);
});