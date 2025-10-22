document.addEventListener("DOMContentLoaded", async () => {
  /**
   * REFERENCIAS AL DOM
   * Obtenemos todos los elementos necesarios para la aplicación
   */
  const loader = document.getElementById("loader");
  const container = document.getElementById("container-grafico");
  const pieChartContainer = document.getElementById("pie-chart-container");
  const botonLimpiar = document.getElementById("limpiar-filtros");
  const filtroArea = document.getElementById("filtro-area");
  const filtroAnio = document.getElementById("filtro-anio");
  const filtroMes = document.getElementById("filtro-mes");
  const filtroDia = document.getElementById("filtro-dia");
  const btnAbrirModal = document.getElementById("btnAbrirModal");
  
  // Mostrar loader mientras carga
  loader.style.display = "flex";
  container.style.display = "none";
  pieChartContainer.style.display = "none";

  // Array que contendrá todos los datos procesados
  let arrayObj = [];

  /**
   * CAMPOS EXCLUIDOS
   * Lista de campos que NO son salas de procesos (metadata)
   */
  const CAMPOS_EXCLUIDOS = [
    "_id", "ANNIO", "SEMANA", "META", "FECHA", "__v",
    "id", "año", "ano", "mes", "dia", "day", "month", "year",
    "DIA", "MES", "ID", "INY TRUTRO", "INY_TRUTRO"
  ];

  /**
   * FUNCIÓN: Obtener nombre del mes
   * Convierte número de mes (1-12) a nombre en español
   */
  const obtenerNombreMes = (numeroMes) => {
    const meses = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    return meses[numeroMes - 1];
  };

  /**
   * FUNCIÓN: Calcular fecha de hace N días
   * Retorna un objeto Date restando N días de hoy
   */
  const obtenerFechaHaceNDias = (dias) => {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - dias);
    return fecha;
  };

  /**
   * FUNCIÓN: Verificar si fecha está en últimos N días
   * Compara una fecha específica con el rango de últimos N días
   */
  const estaEnUltimosDias = (anno, mes, dia, diasAtras) => {
    const fechaRegistro = new Date(anno, mes - 1, dia);
    const fechaLimite = obtenerFechaHaceNDias(diasAtras);
    const fechaHoy = new Date();
    
    return fechaRegistro >= fechaLimite && fechaRegistro <= fechaHoy;
  };

  /**
   * FUNCIÓN: Validar si un campo es sala de procesos
   * Retorna true solo si es una sala válida (no metadata)
   */
  const esSalaDeProcesos = (key, value) => {
    const keyLower = key.toLowerCase();
    
    // Verificar que no esté en la lista de excluidos
    if (CAMPOS_EXCLUIDOS.some(campo => keyLower.includes(campo.toLowerCase()))) {
      return false;
    }
    
    // Verificar que sea un valor numérico válido
    if (typeof value !== "number" && typeof value !== "string") {
      return false;
    }
    
    const numVal = typeof value === "number" 
      ? value 
      : parseFloat(String(value).replace(",", "."));
    
    return !isNaN(numVal);
  };

  /**
   * FUNCIÓN PRINCIPAL: Obtener datos de la API
   * Hace fetch a la API y procesa los datos
   * Retorna array de objetos con información de salas
   */
  const getContactoDirecto = async () => {
    const url = "https://apimedidores.apidev.info/ariztia/contacto_directo_indirecto";
    try {
      const resp = await fetch(url, {
        method: "GET",
        headers: {
          "authorization": "paico2021",
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
      });

      const rawText = await resp.text();
      let json;
      
      // Intentar parsear la respuesta como JSON
      try {
        json = JSON.parse(rawText);
      } catch (e) {
        console.error("La API no devolvió JSON válido:", rawText);
        return [];
      }

      if (!json || !Array.isArray(json.data)) {
        console.warn("JSON no tiene data en formato esperado:", json);
        return [];
      }

      const raw = json.data;
      const out = [];
      let N = 1;

      // Procesar cada registro de la API
      raw.forEach((item) => {
        // Extraer datos temporales directamente de la API
        const anno = item.ANNIO;
        const mes = item.MES;
        const dia = item.DIA;
        const fecha = item.FECHA;
        const nombreMes = obtenerNombreMes(mes);

        // Formatear fecha para mostrar
        const diaStr = String(dia).padStart(2, '0');
        const mesStr = String(mes).padStart(2, '0');
        const fechaFormateada = `${diaStr}/${mesStr}/${anno}`;

        // Iterar sobre todas las propiedades del registro
        Object.keys(item).forEach((key) => {
          const value = item[key];
          
          // Validar si es una sala de procesos
          if (!esSalaDeProcesos(key, value)) {
            return; // Saltar si no es sala
          }

          // Convertir valor a número
          const numVal = typeof value === "number"
            ? value
            : parseFloat(String(value).replace(",", "."));
          
          if (isNaN(numVal)) return;

          // Crear objeto con toda la información
          out.push({
            N: N++,
            sala_de_procesos: key.replace(/_/g, " ").trim(),
            area: key.replace(/_/g, " ").trim(),
            contacto_directo: +(numVal * 100).toFixed(2), // Convertir a porcentaje
            // Datos temporales
            anno,
            mes,
            nombreMes,
            dia,
            fecha,
            fechaFormateada,
            fechaCompleta: new Date(anno, mes - 1, dia)
          });
        });
      });

      return out;
    } catch (error) {
      console.error("Error al consultar API contacto_directo:", error);
      return [];
    }
  };

  /**
   * FUNCIÓN: Eliminar duplicados y ordenar
   * Recibe un array y retorna valores únicos ordenados
   */
  const uniqueSorted = (array) => {
    const filtered = array.filter(v => v !== undefined && v !== null && v !== "");
    const uniq = Array.from(new Set(filtered));
    return uniq.sort((a, b) => {
      const na = Number(a), nb = Number(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return String(a).localeCompare(String(b));
    });
  };

  /**
   * FUNCIÓN: Poblar select con opciones
   * Llena un elemento select con valores y labels personalizados
   */
  const poblarSelect = (select, valores, labelFn = v => v) => {
    if (!select) return;
    select.innerHTML = "";

    // Agregar opción por defecto
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "--";
    select.appendChild(opt0);
    
    // Agregar cada valor
    valores.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = labelFn(v);
      select.appendChild(opt);
    });
  };

  /**
   * FUNCIÓN: Agregar valores por sala
   * Agrupa datos por sala y calcula suma, conteo y promedio
   */
  const agregarPorSala = (datos) => {
    const map = {};
    
    datos.forEach((d) => {
      const k = d.sala_de_procesos || "Sin sala";
      const v = Number(d.contacto_directo) || 0;
      
      if (!map[k]) {
        map[k] = { sala: k, sum: 0, count: 0 };
      }
      
      map[k].sum += v;
      map[k].count += 1;
    });
    
    return Object.values(map).map((o) => ({
      sala: o.sala,
      sum: o.sum,
      count: o.count,
      avg: o.count ? +(o.sum / o.count).toFixed(2) : 0
    }));
  };

  /**
   * FUNCIÓN: Renderizar gráfico de barras
   * Crea gráfico de columnas con Highcharts
   */
  const renderGraficoBarras = (datosFiltrados, tituloExtra = "") => {
    if (!container) return;
    
    const agg = agregarPorSala(datosFiltrados);
    agg.sort((a, b) => b.avg - a.avg); // Ordenar de mayor a menor

    if (agg.length === 0) {
      container.innerHTML = '<p style="color:red; text-align:center; padding:20px;">No hay datos de salas para mostrar</p>';
      return;
    }

    const titulo = `Contacto Directo por Sala de Procesos${tituloExtra}`;

    Highcharts.chart(container, {
      chart: { type: "column" },
      title: { text: titulo },
      subtitle: { text: `Total de registros: ${datosFiltrados.length}` },
      xAxis: { 
        categories: agg.map((a) => a.sala), 
        labels: { 
          rotation: -45, 
          style: { fontSize: "11px" } 
        } 
      },
      yAxis: {
        min: 0,
        title: { text: "Porcentaje (%)" },
        plotLines: [{ 
          value: 20, 
          width: 2, 
          color: "green", 
          dashStyle: "longdash",
          label: {  
            style: { color: "green", fontWeight: "bold" } 
          }
        }]
      },
      tooltip: {
        formatter: function() {
          return `<b>${this.x}</b><br/>Promedio: <b>${this.y}%</b>`;
        }
      },
      series: [{
        name: "% Contacto Directo",
        data: agg.map((a) => ({ 
          y: a.avg, 
          color: a.avg > 20 ? "#ff0000ff" : "#15ca3fff" // Rojo si supera meta, verde si cumple
        })),
        dataLabels: { 
          enabled: true, 
          formatter: function () { return this.y + "%"; }, 
          style: { 
            fontSize: "11px", 
            fontWeight: "bold", 
            textOutline: "none",
            color: "#333"
          } 
        }
      }],
      credits: { enabled: false }
    });
  };

  /**
   * FUNCIÓN: Renderizar gráfico de pastel
   * Crea gráfico circular con distribución por sala
   */
  const renderGraficoPastel = (datosFiltrados, tituloExtra = "") => {
    if (!pieChartContainer) return;
    
    // Agregar valores por sala
    const agg = datosFiltrados.reduce((acc, d) => {
      const sala = d.sala_de_procesos || "Sin sala";
      acc[sala] = (acc[sala] || 0) + Number(d.contacto_directo);
      return acc;
    }, {});
    
    const dataPie = Object.entries(agg).map(([name, y]) => ({ name, y }));

    if (dataPie.length === 0) {
      pieChartContainer.innerHTML = '<p style="color:red; text-align:center; padding:20px;">No hay datos de salas para el gráfico circular</p>';
      return;
    }

    const titulo = `Distribución de Contacto Directo${tituloExtra}`;

    Highcharts.chart(pieChartContainer, {
      chart: { type: "pie" },
      title: { text: titulo },
      tooltip: { 
        pointFormat: "{series.name}: <b>{point.percentage:.1f}%</b><br/>Valor acumulado: {point.y:.2f}" 
      },
      plotOptions: { 
        pie: { 
          allowPointSelect: true, 
          cursor: "pointer", 
          dataLabels: { 
            enabled: true, 
            format: "<b>{point.name}</b>: {point.percentage:.1f}%",
            style: { fontSize: "11px" }
          } 
        } 
      },
      series: [{ 
        name: "Porcentaje", 
        colorByPoint: true, 
        data: dataPie 
      }],
      credits: { enabled: false }
    });
  };

  /**
   * FUNCIÓN PRINCIPAL: Manejar filtros
   * Implementa lógica de filtros en cascada:
   * - Sin filtros: Últimos 7 días
   * - Con año: Ver por mes
   * - Con año + mes: Ver por día
   * - Con año + mes + día: Ver día específico
   */
  const manejarFiltros = () => {
    let filtrados = [...arrayObj];
    let tituloExtra = "";

    // FILTRO DE ÁREA (siempre activo si se selecciona)
    if (filtroArea?.value) {
      filtrados = filtrados.filter((d) => 
        String(d.area).trim() === String(filtroArea.value).trim()
      );
    }

    // OBTENER VALORES DE FILTROS TEMPORALES
    const hayAnio = filtroAnio?.value;
    const hayMes = filtroMes?.value;
    const hayDia = filtroDia?.value;

    /**
     * LÓGICA DE FILTROS EN CASCADA
     */
    if (!hayAnio && !hayMes && !hayDia) {
      // CASO 1: Sin filtros = ÚLTIMOS 7 DÍAS
      filtrados = filtrados.filter((d) => 
        estaEnUltimosDias(d.anno, d.mes, d.dia, 7)
      );
      tituloExtra = " - Últimos 7 días";
      
    } else if (hayAnio && !hayMes && !hayDia) {
      // CASO 2: Solo año = MOSTRAR TODO EL AÑO
      filtrados = filtrados.filter((d) => 
        String(d.anno) === String(hayAnio)
      );
      tituloExtra = ` - Año ${hayAnio}`;
      
    } else if (hayAnio && hayMes && !hayDia) {
      // CASO 3: Año + mes = MOSTRAR TODO EL MES
      filtrados = filtrados.filter((d) => 
        String(d.anno) === String(hayAnio) &&
        String(d.mes) === String(hayMes)
      );
      const nombreMes = obtenerNombreMes(parseInt(hayMes));
      tituloExtra = ` - ${nombreMes} ${hayAnio}`;
      
    } else if (hayAnio && hayMes && hayDia) {
      // CASO 4: Año + mes + día = DÍA ESPECÍFICO
      filtrados = filtrados.filter((d) => 
        String(d.anno) === String(hayAnio) &&
        String(d.mes) === String(hayMes) &&
        String(d.dia) === String(hayDia)
      );
      const nombreMes = obtenerNombreMes(parseInt(hayMes));
      tituloExtra = ` - ${hayDia} de ${nombreMes} ${hayAnio}`;
    }

    // VALIDAR SI HAY DATOS
    if (filtrados.length === 0) {
      if (container) {
        container.innerHTML = '<p style="color:#dc3545; text-align:center; padding:30px; font-size:16px;">No hay datos de salas para la selección actual</p>';
      }
      if (pieChartContainer) {
        pieChartContainer.innerHTML = '<p style="color:#dc3545; text-align:center; padding:30px; font-size:16px;">No hay datos de salas para la selección actual</p>';
      }
    } else {
      // RENDERIZAR GRÁFICOS
      renderGraficoBarras(filtrados, tituloExtra);
      renderGraficoPastel(filtrados, tituloExtra);
    }

    // OCULTAR LOADER Y MOSTRAR GRÁFICOS
    if (loader) loader.style.display = "none";
    if (container) container.style.display = "block";
    if (pieChartContainer) pieChartContainer.style.display = "block";
  };

  /**
   * ==================================================
   * INICIALIZACIÓN DE LA APLICACIÓN
   * ==================================================
   */
  
  // Cargar datos desde la API
  arrayObj = await getContactoDirecto();
  
  if (arrayObj.length === 0) {
    console.warn("No se cargaron datos desde la API");
    loader.style.display = "none";
    return;
  }
  
  /**
   * POBLAR FILTRO DE AÑOS
   */
  const aniosDisponibles = uniqueSorted(arrayObj.map((d) => d.anno));
  poblarSelect(filtroAnio, aniosDisponibles);
  
  /**
   * POBLAR FILTRO DE ÁREAS (salas de procesos)
   */
  const areasDisponibles = uniqueSorted(arrayObj.map((d) => d.area));
  poblarSelect(filtroArea, areasDisponibles);

  /**
   * INICIALIZAR FILTRO DE MES (deshabilitado inicialmente)
   */
  if (filtroMes) {
    poblarSelect(filtroMes, []);
    filtroMes.disabled = true;
  }

  /**
   * INICIALIZAR FILTRO DE DÍA (deshabilitado inicialmente)
   */
  if (filtroDia) {
    poblarSelect(filtroDia, []);
    filtroDia.disabled = true;
  }

  /**
   * ==================================================
   * EVENT LISTENERS DE FILTROS
   * ==================================================
   */

  /**
   * FILTRO DE AÑO
   * Al seleccionar año, habilita filtro de mes
   */
  if (filtroAnio) {
    filtroAnio.addEventListener("change", () => {
      const selectedYear = filtroAnio.value;
      
      if (!selectedYear) {
        // Sin año: deshabilitar mes y día
        if (filtroMes) {
          poblarSelect(filtroMes, []);
          filtroMes.value = "";
          filtroMes.disabled = true;
        }
        if (filtroDia) {
          poblarSelect(filtroDia, []);
          filtroDia.value = "";
          filtroDia.disabled = true;
        }
        manejarFiltros();
        return;
      }
      
      // Obtener meses disponibles para el año
      const mesesParaAnio = uniqueSorted(
        arrayObj
          .filter((d) => String(d.anno) === String(selectedYear))
          .map((d) => d.mes)
      );
      
      // Poblar y habilitar filtro de mes
      if (filtroMes) {
        poblarSelect(filtroMes, mesesParaAnio, (numeroMes) => {
          return obtenerNombreMes(parseInt(numeroMes));
        });
        filtroMes.value = "";
        filtroMes.disabled = false;
      }
      
      // Resetear y deshabilitar día
      if (filtroDia) {
        poblarSelect(filtroDia, []);
        filtroDia.value = "";
        filtroDia.disabled = true;
      }
      
      manejarFiltros();
    });
  }

  /**
   * FILTRO DE MES
   * Al seleccionar mes, habilita filtro de día
   */
  if (filtroMes) {
    filtroMes.addEventListener("change", () => {
      const selectedYear = filtroAnio.value;
      const selectedMonth = filtroMes.value;
      
      if (!selectedMonth) {
        // Sin mes: deshabilitar día
        if (filtroDia) {
          poblarSelect(filtroDia, []);
          filtroDia.value = "";
          filtroDia.disabled = true;
        }
        manejarFiltros();
        return;
      }
      
      // Obtener días disponibles para año + mes
      const diasParaMes = uniqueSorted(
        arrayObj
          .filter((d) => 
            String(d.anno) === String(selectedYear) &&
            String(d.mes) === String(selectedMonth)
          )
          .map((d) => d.dia)
      );
      
      // Poblar y habilitar filtro de día
      if (filtroDia) {
        poblarSelect(filtroDia, diasParaMes, (dia) => `Día ${dia}`);
        filtroDia.value = "";
        filtroDia.disabled = false;
      }
      
      manejarFiltros();
    });
  }

  /**
   * FILTRO DE DÍA
   * Al seleccionar día, filtra por día específico
   */
  if (filtroDia) {
    filtroDia.addEventListener("change", manejarFiltros);
  }

  /**
   * FILTRO DE ÁREA
   * Filtra por sala de procesos específica
   */
  if (filtroArea) {
    filtroArea.addEventListener("change", manejarFiltros);
  }

  /**
   * BOTÓN LIMPIAR FILTROS
   * Resetea todos los filtros y muestra últimos 7 días
   */
  if (botonLimpiar) {
    botonLimpiar.addEventListener("click", () => {
      // Resetear año
      if (filtroAnio) filtroAnio.value = "";
      
      // Resetear y deshabilitar mes
      if (filtroMes) {
        filtroMes.value = "";
        poblarSelect(filtroMes, []);
        filtroMes.disabled = true;
      }
      
      // Resetear y deshabilitar día
      if (filtroDia) {
        filtroDia.value = "";
        poblarSelect(filtroDia, []);
        filtroDia.disabled = true;
      }
      
      // Resetear área
      if (filtroArea) filtroArea.value = "";
      
      // Volver a mostrar últimos 7 días
      manejarFiltros();
    });
  }


  //  RENDERIZADO INICIAL
  //  Muestra gráficos con datos de los últimos 7 días

  manejarFiltros();


  // APLICAR RESTRICCIONES DE ROL
  // Deshabilitar botón de carga si no es ADMIN

  if (typeof disableUploadForNonAdmin === 'function') {
    disableUploadForNonAdmin();
  }
});