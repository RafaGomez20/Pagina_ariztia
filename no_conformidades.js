//referencias al dom
const graficoCanvas = document.getElementById("graficoNoConformidades");
const tablaDiv = document.getElementById("tablaNoConformidades");
const filtroAnio = document.getElementById("filtro-anio");
const filtroMes = document.getElementById("filtro-mes");
const filtroDia = document.getElementById("filtro-dia");
const filtroArea = document.getElementById("filtro-responsable");
const filtroEstado = document.getElementById("filtro-estado");
const botonLimpiar = document.getElementById("limpiar-filtros");
const btnNuevaNc = document.getElementById("btn-nueva-nc");
const btnEditarNc = document.getElementById("btn-editar-nc");
const loader = document.getElementById("loader");

let chart = null;
let arrayObj = [];
let datosGraficoSeleccionado = [];

//funciones utiles
function extraerDiaDeFecha(fecha) {
  if (!fecha || typeof fecha !== "string") return "";
  const partes = fecha.split("-");
  if (partes.length !== 3) return "";

  if (partes[0].length <= 2 && partes[1].length === 2 && partes[2].length === 4) {
    return partes[0].padStart(2, "0");
  }
  if (partes[0].length === 4) {
    return partes[2].slice(0, 2).padStart(2, "0");
  }
  return "";
}

function normaliza(valor) {
  return valor === undefined || valor === null ? "" : String(valor).trim();
}

function valoresUnicos(arr, campo) {
  const valores = arr.map(item => normaliza(item[campo])).filter(v => v !== "");
  return [...new Set(valores)].sort();
}

function poblarSelect(select, opciones) {
  select.innerHTML = "";
  const optBlank = document.createElement("option");
  optBlank.value = "";
  optBlank.textContent = "--";
  select.appendChild(optBlank);
  opciones.forEach(valor => {
    const opt = document.createElement("option");
    opt.value = valor;
    opt.textContent = valor;
    select.appendChild(opt);
  });
}

//tabla ultimas 3
function mostrarUltimas3(datos) {
  tablaDiv.innerHTML = "";
  const tabla = document.createElement("table");
  tabla.className = "tabla-ultimas";
  tabla.style.cursor = "default";
  tablaDiv.appendChild(tabla);

  const ultimas3 = [...datos].sort(
    (a, b) =>
      new Date(b.FECHA_DETECCION.split("-").reverse().join("-")) -
      new Date(a.FECHA_DETECCION.split("-").reverse().join("-"))
  ).slice(0, 3);

  tabla.innerHTML = `
      <thead>
          <tr>
              <th class="small">N Folio</th>
              <th class="small">Usuario</th>
              <th class="small">Fecha detección</th>
              <th class="small">Área</th>
              <th class="small">Observación</th>
              <th class="small">Estado</th>
          </tr>
      </thead>
      <tbody>
          ${ultimas3
            .map(
              item => `
              <tr>
                  <td class="small">${item.N_FOLIO}</td>
                  <td class="small">${item.USUARIO}</td>
                  <td class="small">${item.FECHA_DETECCION}</td>
                  <td class="small">${item.AREA}</td>
                  <td class="small">${item.OBSERVACION}</td>
                  <td class="small">${item.ESTADO}</td>
              </tr>`
            )
            .join("")}
      </tbody>
  `;
}

//filtros dinamicos
function poblarDias() {
  const anioSeleccionado = filtroAnio.value;
  const mesSeleccionado = filtroMes.value;
  if (!anioSeleccionado || !mesSeleccionado) {
    poblarSelect(filtroDia, []);
    filtroDia.disabled = true;
    return;
  }
  const diasDisponibles = valoresUnicos(
    arrayObj.filter(d => d.ANNIO == anioSeleccionado && d.MES == mesSeleccionado),
    "DIA"
  );
  poblarSelect(filtroDia, diasDisponibles);
  filtroDia.disabled = diasDisponibles.length === 0;
}

function poblarEstados() {
  const areaSeleccionada = filtroArea.value;
  if (!areaSeleccionada) {
    poblarSelect(filtroEstado, []);
    filtroEstado.disabled = true;
    return;
  }
  const estadosDisponibles = valoresUnicos(
    arrayObj.filter(d => d.AREA == areaSeleccionada),
    "ESTADO"
  );
  poblarSelect(filtroEstado, estadosDisponibles);
  filtroEstado.disabled = estadosDisponibles.length === 0;
}

function aplicarFiltros() {
  loader.style.display = "flex";
  const anioSeleccionado = filtroAnio.value;
  const mesSeleccionado = filtroMes.value;
  const diaSeleccionado = filtroDia.value;
  const areaSeleccionada = filtroArea.value;
  const estadoSeleccionado = filtroEstado.value;
  let datosFiltrados = [...arrayObj];

  if (anioSeleccionado) datosFiltrados = datosFiltrados.filter(d => d.ANNIO == anioSeleccionado);
  if (mesSeleccionado) datosFiltrados = datosFiltrados.filter(d => d.MES == mesSeleccionado);
  if (diaSeleccionado) datosFiltrados = datosFiltrados.filter(d => d.DIA == diaSeleccionado);
  if (areaSeleccionada) datosFiltrados = datosFiltrados.filter(d => d.AREA == areaSeleccionada);
  if (estadoSeleccionado) datosFiltrados = datosFiltrados.filter(d => d.ESTADO == estadoSeleccionado);

  renderizarContenido(datosFiltrados);
  loader.style.display = "none";
}

//renderizar grafico con agrupación dinámica
function renderizarContenido(datos) {
  if (chart) chart.destroy && chart.destroy();

  if (!datos || datos.length === 0) {
    graficoCanvas.style.display = "none";
    mostrarUltimas3(arrayObj);
    return;
  }

  graficoCanvas.style.display = "block";
  const agrupado = {};
  
  let criterioAgrupacion = "";
  let tituloGrafico = "";
  let tituloEjeX = "";

  if (filtroAnio.value && !filtroMes.value && !filtroDia.value) {
    criterioAgrupacion = "MES";
    tituloGrafico = "Pareto de No Conformidades por Mes";
    tituloEjeX = "Meses";
    datos.forEach(d => {
      const key = d.MES || "Sin mes";
      agrupado[key] = (agrupado[key] || 0) + 1;
    });
  } 
  else if (filtroAnio.value && filtroMes.value && !filtroDia.value) {
    criterioAgrupacion = "DIA";
    tituloGrafico = "Pareto de No Conformidades por Día";
    tituloEjeX = "Días";
    datos.forEach(d => {
      const key = d.DIA || "Sin día";
      agrupado[key] = (agrupado[key] || 0) + 1;
    });
  }
  else if (filtroDia.value) {
    criterioAgrupacion = "FECHA_DETECCION";
    tituloGrafico = "No Conformidades del Día Seleccionado";
    tituloEjeX = "Fecha";
    datos.forEach(d => {
      const key = d.FECHA_DETECCION || "Sin fecha";
      agrupado[key] = (agrupado[key] || 0) + 1;
    });
  }
  else {
    criterioAgrupacion = "MES";
    tituloGrafico = "Pareto de No Conformidades por Mes";
    tituloEjeX = "Meses";
    datos.forEach(d => {
      const key = d.MES || "Sin mes";
      agrupado[key] = (agrupado[key] || 0) + 1;
    });
  }

  const ordenado = Object.entries(agrupado).sort((a, b) => b[1] - a[1]);
  const labels = ordenado.map(([key]) => key);
  const conteos = ordenado.map(([_, conteo]) => conteo);

  chart = Highcharts.chart(graficoCanvas, {
    chart: { type: "column" },
    title: { text: tituloGrafico },
    xAxis: { categories: labels, title: { text: tituloEjeX } },
    yAxis: [
      { title: { text: "Cantidad" } },
      { title: { text: "Porcentaje acumulado" }, max: 100, opposite: true }
    ],
    tooltip: { shared: true },
    series: [
      { name: "Cantidad", type: "column", data: conteos },
      { type: "pareto", name: "Pareto", yAxis: 1, baseSeries: 0, zIndex: 10 }
    ],
    tooltip: { valueDecimals: 2 }
  });

  chart.series[0].points.forEach((punto, idx) => {
    punto.update({ cursor: "pointer" });

    Highcharts.addEvent(punto, "mouseOver", () => {
      punto.graphic.attr({ fill: "#7cb5ec" });
      graficoCanvas.style.cursor = "pointer";
    });

    Highcharts.addEvent(punto, "mouseOut", () => {
      punto.graphic.attr({ fill: punto.color });
      graficoCanvas.style.cursor = "default";
    });

    Highcharts.addEvent(punto, "click", () => {
      const label = labels[idx];
      if (criterioAgrupacion === "MES") {
        datosGraficoSeleccionado = datos.filter(d => d.MES === label);
      } else if (criterioAgrupacion === "DIA") {
        datosGraficoSeleccionado = datos.filter(d => d.DIA === label);
      } else {
        datosGraficoSeleccionado = datos.filter(d => d.FECHA_DETECCION === label);
      }

      mostrarTablaGrafico(datosGraficoSeleccionado);
    });
  });

  if (!filtroAnio.value && !filtroMes.value && !filtroDia.value) {
    mostrarUltimas3(arrayObj);
  }
}

function mostrarTablaGrafico(datos) {
  tablaDiv.innerHTML = "";
  const tabla = document.createElement("table");
  tabla.className = "tabla-ultimas";
  tabla.style.cursor = "default";
  tablaDiv.appendChild(tabla);

  tabla.innerHTML = `
      <thead>
          <tr>
              <th class="small">N Folio</th>
              <th class="small">Usuario</th>
              <th class="small">Fecha detección</th>
              <th class="small">Área</th>
              <th class="small">Observación</th>
              <th class="small">Estado</th>
          </tr>
      </thead>
      <tbody>
          ${datos
            .map(
              item => `
              <tr>
                  <td>${item.N_FOLIO}</td>
                  <td>${item.USUARIO}</td>
                  <td>${item.FECHA_DETECCION}</td>
                  <td>${item.AREA}</td>
                  <td>${item.OBSERVACION}</td>
                  <td>${item.ESTADO}</td>
              </tr>`
            )
            .join("")}
      </tbody>
  `;
}

//eventos filtros
botonLimpiar.addEventListener("click", () => {
  filtroAnio.value = "";
  filtroMes.value = "";
  filtroDia.value = "";
  filtroArea.value = "";
  filtroEstado.value = "";
  poblarSelect(filtroMes, []);
  poblarSelect(filtroDia, []);
  poblarSelect(filtroEstado, []);
  filtroMes.disabled = true;
  filtroDia.disabled = true;
  filtroEstado.disabled = true;
  renderizarContenido(arrayObj);
});

filtroAnio.addEventListener("change", () => {
  const meses = filtroAnio.value
    ? valoresUnicos(arrayObj.filter(d => d.ANNIO == filtroAnio.value), "MES")
    : [];
  poblarSelect(filtroMes, meses);
  filtroMes.disabled = meses.length === 0;
  poblarSelect(filtroDia, []);
  aplicarFiltros();
});
filtroMes.addEventListener("change", () => {
  poblarDias();
  aplicarFiltros();
});
filtroDia.addEventListener("change", aplicarFiltros);
filtroArea.addEventListener("change", () => {
  poblarEstados();
  aplicarFiltros();
});
filtroEstado.addEventListener("change", aplicarFiltros);


//inicializar
async function inicializar() {
  loader.style.display = "flex";
  try {
    const res = await fetch("https://apimedidores.apidev.info/ariztia/no_conformidades");
    const json = await res.json();
    if (json && json.data && Array.isArray(json.data)) {
      arrayObj = json.data.map(item => ({
        N_FOLIO: normaliza(item.N_FOLIO),
        USUARIO: normaliza(item.USUARIO),
        ANNIO: normaliza(item.ANNIO),
        MES: normaliza(item.MES),
        FECHA_DETECCION: normaliza(item.FECHA_DETECCION),
        DIA: extraerDiaDeFecha(item.FECHA_DETECCION),
        AREA: normaliza(item.AREA),
        TIPO_NC: normaliza(item.TIPO_NC),
        ESTADO: normaliza(item.ESTADO),
        OBSERVACION: normaliza(item.OBSERVACION)
      }));
    }
    poblarSelect(filtroAnio, valoresUnicos(arrayObj, "ANNIO"));
    poblarSelect(filtroArea, valoresUnicos(arrayObj, "AREA"));
    filtroMes.disabled = true;
    filtroDia.disabled = true;
    filtroEstado.disabled = true;
    renderizarContenido(arrayObj);
  } catch (error) {
    console.error("Error al obtener datos de la api:", error);
    tablaDiv.innerHTML =
      "<p style='color:red; padding:20px;'>error al conectar con la api</p>";
  } finally {
    loader.style.display = "none";
    
    //APLICAR RESTRICCIONES DE ROL
    if (typeof disableEditForNonAdmin === 'function') {
      disableEditForNonAdmin();
    }
  }
}

inicializar();

//agregar nueva no conformidad desde formulario
const overlay = document.getElementById("overlay");
const formNc = document.getElementById("form-nc");
const modalConfirm = document.getElementById("modal-confirm");
const cancelarEnvio = document.getElementById("cancelar-envio");
const confirmarEnvio = document.getElementById("confirmar-envio");

formNc.addEventListener("input", () => {
  const valido = formNc.checkValidity();
  formNc.querySelector("button[type='submit']").disabled = !valido;
});

formNc.addEventListener("submit", e => {
  e.preventDefault();
  modalConfirm.style.display = "flex";
});

cancelarEnvio.addEventListener("click", () => {
  modalConfirm.style.display = "none";
});

confirmarEnvio.addEventListener("click", async () => {
  modalConfirm.style.display = "none";
  loader.style.display = "flex";

  const user = sessionStorage.getItem("user") || user;
  const fechaInput = formNc.fecha_deteccion.value;
  const fecha = fechaInput.split("-");
  const fechaFormateada = `${fecha[2]}-${fecha[1]}-${fecha[0]}`;

  const nuevaNc = {
    USUARIO: user,
    N_FOLIO: formNc.folio.value.trim(),
    MES: formNc.mes.value.trim(),
    ANNIO: formNc.anio.value.trim(),
    FECHA_DETECCION: fechaFormateada,
    AREA: formNc.area.value.trim(),
    TIPO_NC: formNc.tipo_nc.value.trim(),
    OBSERVACION: formNc.observacion.value.trim(),
    ESTADO: formNc.estado.value.trim()
  };

  try {
    const res = await fetch("https://apimedidores.apidev.info/ariztia/no_conformidades_crud", {
      method: "POST",
      headers: {
        authorization: "paico2021",
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify(nuevaNc)
    });

    if (!res.ok) throw new Error("Error al enviar la no conformidad");

    alert("No conformidad agregada correctamente");
    overlay.style.display = "none";
    document.body.style.overflow = "auto";
    formNc.reset();
    formNc.querySelector("button[type='submit']").disabled = true;
    await inicializar();
  } catch (error) {
    console.error("Error al agregar no conformidad:", error);
    alert("Error al agregar la no conformidad");
  } finally {
    loader.style.display = "none";
  }
});

//editar no conformidad
const overlayListaEditar = document.getElementById("overlay-lista-editar");
const overlayEditar = document.getElementById("overlay-editar");
const cerrarModalLista = document.getElementById("cerrar-modal-lista");
const cerrarModalEditar = document.getElementById("cerrar-modal-editar");
const listaFolios = document.getElementById("lista-folios");
const formNcEditar = document.getElementById("form-nc-editar");
const modalConfirmEditar = document.getElementById("modal-confirm-editar");
const cancelarEnvioEditar = document.getElementById("cancelar-envio-editar");
const confirmarEnvioEditar = document.getElementById("confirmar-envio-editar");

//Abrir modal de lista de folios CON VERIFICACIÓN DE PERMISOS
btnEditarNc.addEventListener("click", () => {
  // VERIFICAR PERMISOS ANTES DE ABRIR EL MODAL
  if (typeof verificarPermisosYEjecutar === 'function') {
    verificarPermisosYEjecutar(() => {
      mostrarListaFolios();
      overlayListaEditar.style.display = "flex";
      document.body.style.overflow = "hidden";
    });
  } else {
    // Fallback si no existe la función de verificación
    mostrarListaFolios();
    overlayListaEditar.style.display = "flex";
    document.body.style.overflow = "hidden";
  }
});

//Cerrar modal de lista
cerrarModalLista.addEventListener("click", () => {
  overlayListaEditar.style.display = "none";
  document.body.style.overflow = "auto";
});

overlayListaEditar.addEventListener("click", (e) => {
  if (e.target === overlayListaEditar) {
    overlayListaEditar.style.display = "none";
    document.body.style.overflow = "auto";
  }
});

//Cerrar modal de edición
cerrarModalEditar.addEventListener("click", () => {
  overlayEditar.style.display = "none";
  document.body.style.overflow = "auto";
});

overlayEditar.addEventListener("click", (e) => {
  if (e.target === overlayEditar) {
    overlayEditar.style.display = "none";
    document.body.style.overflow = "auto";
  }
});

//Mostrar lista de folios para editar
function mostrarListaFolios() {
  listaFolios.innerHTML = "";
  
  if (arrayObj.length === 0) {
    listaFolios.innerHTML = "<p class='text-center p-3'>No hay no conformidades disponibles</p>";
    return;
  }

  arrayObj.forEach(item => {
    const divItem = document.createElement("div");
    divItem.className = "item-folio";
    divItem.innerHTML = `
      <div>
        <strong>Folio:</strong> ${item.N_FOLIO} - 
        <strong>Fecha:</strong> ${item.FECHA_DETECCION} - 
        <strong>Área:</strong> ${item.AREA}
      </div>
      <button class="btn-editar-folio" data-folio="${item.N_FOLIO}">Editar</button>
    `;
    listaFolios.appendChild(divItem);
  });

  //Agregar eventos a los botones de editar
  document.querySelectorAll(".btn-editar-folio").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const folio = e.target.getAttribute("data-folio");
      cargarDatosParaEditar(folio);
    });
  });
}

//Cargar datos de una no conformidad específica para editar
function cargarDatosParaEditar(folio) {
  const nc = arrayObj.find(item => item.N_FOLIO === folio);
  
  if (!nc) {
    alert("No se encontró la no conformidad");
    return;
  }

  //Guardar el folio original
  document.getElementById("folio-original").value = nc.N_FOLIO;

  //Llenar el formulario con los datos
  document.getElementById("folio-editar").value = nc.N_FOLIO;
  document.getElementById("mes-editar").value = nc.MES;
  document.getElementById("anio-editar").value = nc.ANNIO;
  
  //Convertir fecha de dd-mm-yyyy a yyyy-mm-dd para el input date
  const fechaPartes = nc.FECHA_DETECCION.split("-");
  if (fechaPartes.length === 3) {
    const fechaISO = `${fechaPartes[2]}-${fechaPartes[1]}-${fechaPartes[0]}`;
    document.getElementById("fecha_deteccion-editar").value = fechaISO;
  }
  
  document.getElementById("area-editar").value = nc.AREA;
  document.getElementById("tipo_nc-editar").value = nc.TIPO_NC;
  document.getElementById("observacion-editar").value = nc.OBSERVACION;
  document.getElementById("estado-editar").value = nc.ESTADO;

  //Habilitar el botón de guardar
  formNcEditar.querySelector("button[type='submit']").disabled = false;

  //Cerrar lista y abrir formulario de edición
  overlayListaEditar.style.display = "none";
  overlayEditar.style.display = "flex";
}

//Validar formulario de edición
formNcEditar.addEventListener("input", () => {
  const valido = formNcEditar.checkValidity();
  formNcEditar.querySelector("button[type='submit']").disabled = !valido;
});

//Manejar envío del formulario de edición - CORREGIDO
formNcEditar.addEventListener("submit", (e) => {
  e.preventDefault();
  // MOSTRAR MODAL DE CONFIRMACIÓN CON Z-INDEX ALTO
  modalConfirmEditar.style.display = "flex";
  modalConfirmEditar.style.zIndex = "10001"; // Más alto que el overlay de edición
});

cancelarEnvioEditar.addEventListener("click", () => {
  modalConfirmEditar.style.display = "none";
});

confirmarEnvioEditar.addEventListener("click", async () => {
  modalConfirmEditar.style.display = "none";
  loader.style.display = "flex";

  const user = sessionStorage.getItem("user") || "DEFAULT";
  const fechaInput = document.getElementById("fecha_deteccion-editar").value;
  const fecha = fechaInput.split("-");
  const fechaFormateada = `${fecha[2]}-${fecha[1]}-${fecha[0]}`;

  const ncEditada = {
    USUARIO: user,
    N_FOLIO: document.getElementById("folio-editar").value.trim(),
    MES: document.getElementById("mes-editar").value.trim(),
    ANNIO: document.getElementById("anio-editar").value.trim(),
    FECHA_DETECCION: fechaFormateada,
    AREA: document.getElementById("area-editar").value.trim(),
    TIPO_NC: document.getElementById("tipo_nc-editar").value.trim(),
    OBSERVACION: document.getElementById("observacion-editar").value.trim(),
    ESTADO: document.getElementById("estado-editar").value.trim(),
    N_FOLIO_ORIGINAL: document.getElementById("folio-original").value
  };

  try {
    const res = await fetch("https://apimedidores.apidev.info/ariztia/no_conformidades_crud", {
      method: "POST",
      headers: {
        authorization: "paico2021",
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify(ncEditada)
    });

    if (!res.ok) throw new Error("Error al actualizar la no conformidad");

    alert("No conformidad actualizada correctamente");
    overlayEditar.style.display = "none";
    document.body.style.overflow = "auto";
    formNcEditar.reset();
    formNcEditar.querySelector("button[type='submit']").disabled = true;
    await inicializar();
  } catch (error) {
    console.error("Error al actualizar no conformidad:", error);
    alert("Error al actualizar la no conformidad");
  } finally {
    loader.style.display = "none";
  }
});