document.addEventListener("DOMContentLoaded", async () => {

  //verificar sesion de usuario
  if (!sessionStorage.getItem('user')) {
    window.location.href = 'login.html';
    throw new Error('no autorizado - redirigiendo a login');
  }

  //configuracion
  const CONFIG = {
    API_URL: 'https://apimedidores.apidev.info/ariztia/getconsumoshidricos_ts',
    AUTH_TOKEN: 'paico2021',
    TIPOS: {
      POLLO: 'M3H_PANTALON_POLLO',
      PAVO: 'M3H_PANTALON_PAVO'
    },
    SENSOR: 'm1',
    DIAS_INICIALES: 7, //cargar solo los ultimos 7 dias en el inicio
    INICIO_DATOS: 1744156800000, //fecha de inicio de datos disponibles
  };

  //referencias del DOM
  const loader = document.getElementById("loader");
  const container = document.getElementById("container");
  const botonLimpiar = document.getElementById("limpiar-filtros");
  const filtroAnio = document.getElementById("filtro-anio");
  const filtroMes = document.getElementById("filtro-mes");
  const filtroDia = document.getElementById("filtro-dia");

  //esto es para agregar puntos a los resultados de los graficos
  const formatearNumero = (numero) => {
    return numero.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  //variables para datos con cache
  let datosPolloCompletos = [];
  let datosPavoCompletos = [];
  let cacheDatos = {
    pollo: new Map(),
    pavo: new Map()
  };
  let rangosCargados = {
    pollo: [],
    pavo: []
  };

  //clase para gestionar rangos de los datos cargados
  class RangoManager {
    constructor() {
      this.rangos = [];
    }

    agregar(inicio, fin) {
      this.rangos.push({ inicio, fin });
      this.rangos.sort((a, b) => a.inicio - b.inicio);
      this.fusionarRangos();
    }

    fusionarRangos() {
      if (this.rangos.length <= 1) return;
      
      const fusionados = [this.rangos[0]];
      for (let i = 1; i < this.rangos.length; i++) {
        const ultimo = fusionados[fusionados.length - 1];
        const actual = this.rangos[i];
        
        if (actual.inicio <= ultimo.fin) {
          ultimo.fin = Math.max(ultimo.fin, actual.fin);
        } else {
          fusionados.push(actual);
        }
      }
      this.rangos = fusionados;
    }

    estaCargado(inicio, fin) {
      return this.rangos.some(r => r.inicio <= inicio && r.fin >= fin);
    }

    obtenerRangosFaltantes(inicio, fin) {
      if (this.rangos.length === 0) return [{ inicio, fin }];
      
      const faltantes = [];
      let inicioActual = inicio;

      for (const rango of this.rangos) {
        if (inicioActual < rango.inicio && inicioActual < fin) {
          faltantes.push({
            inicio: inicioActual,
            fin: Math.min(rango.inicio - 1, fin)
          });
        }
        inicioActual = Math.max(inicioActual, rango.fin + 1);
      }

      if (inicioActual < fin) {
        faltantes.push({ inicio: inicioActual, fin });
      }

      return faltantes.filter(r => r.inicio < r.fin);
    }
  }

  const rangoManagerPollo = new RangoManager();
  const rangoManagerPavo = new RangoManager();

  //funcion para construir URL de API
  const construirUrl = (tipo, sensor, inicio, fin) => {
    return `${CONFIG.API_URL}/${tipo}/${sensor}/${inicio}/${fin}`;
  };

  //funcio optimizada para pedir datos a la API con cache
  const getMedidores = async (url, tipo) => {
    try {
      const resp = await fetch(url, {
        method: "GET",
        headers: {
          "authorization": CONFIG.AUTH_TOKEN,
          "Accept": "application/json",
          "Content-Type": "application/json"
        }
      });
      
      if (!resp.ok) throw new Error('error en respuesta api');
      
      const data = await resp.json();
      let datos = data.data?.data || [];

      //convertir timestamp y caudal
      return datos.map(item => ({
        timestamp: item.timestamp,
        date: new Date(item.timestamp),
        caudal: parseFloat(item.caudal) || 0
      })).filter(item => !isNaN(item.timestamp));
      
    } catch (e) {
      console.error(`error api ${tipo}:`, e);
      return [];
    }
  };

  //filtrar solo martes a viernes
  //esta funcion verifica el dia de la semana del timestamp
  //getDay() retorna: 2=martes, 3=miércoles, 4=jueves, 5=viernes
  //solo llama a los dias 2, 3, 4, 5 (martes a viernes)
  const filtrarSoloMartesAViernes = (datos) => {
    return datos.filter(item => {
      const diaSemana = item.date.getDay();
      //retorna a true solo si el dia esta entre martes (2) y viernes (5)
      return diaSemana >= 2 && diaSemana <= 5;
    });
  };

  //cargar datos por rango con deteccion de rangos faltantes
  const cargarDatosPorRango = async (tipo, inicio, fin) => {
    const esPollo = tipo === CONFIG.TIPOS.POLLO;
    const rangoManager = esPollo ? rangoManagerPollo : rangoManagerPavo;
    
    //verificar si ya esta cargado
    if (rangoManager.estaCargado(inicio, fin)) {
      return esPollo ? datosPolloCompletos : datosPavoCompletos;
    }

    //obtener rangos faltantes
    const rangosFaltantes = rangoManager.obtenerRangosFaltantes(inicio, fin);
    
    if (rangosFaltantes.length === 0) {
      return esPollo ? datosPolloCompletos : datosPavoCompletos;
    }

    //cargar solo los rangos faltantes en paralelo
    const promesas = rangosFaltantes.map(async rango => {
      const url = construirUrl(tipo, CONFIG.SENSOR, rango.inicio, rango.fin);
      return getMedidores(url, tipo);
    });

    const resultados = await Promise.all(promesas);
    const nuevosDatos = resultados.flat();

    //aca se aplica el filtro para que solo se obtengan datos de martes a viernes
    //tambien se guardan los datos en el cache
    const nuevosDatosFiltrados = filtrarSoloMartesAViernes(nuevosDatos);

    //agregar nuevos datos y eliminar duplicados
    if (esPollo) {
      datosPolloCompletos = [...datosPolloCompletos, ...nuevosDatosFiltrados]
        .filter((item, index, self) => 
          index === self.findIndex(t => t.timestamp === item.timestamp)
        )
        .sort((a, b) => a.timestamp - b.timestamp);
    } else {
      datosPavoCompletos = [...datosPavoCompletos, ...nuevosDatosFiltrados]
        .filter((item, index, self) => 
          index === self.findIndex(t => t.timestamp === item.timestamp)
        )
        .sort((a, b) => a.timestamp - b.timestamp);
    }

    //registrar rango cargado
    rangoManager.agregar(inicio, fin);

    return esPollo ? datosPolloCompletos : datosPavoCompletos;
  };

  //cargar ultimos dias
  const cargarUltimosDias = async (dias = CONFIG.DIAS_INICIALES) => {
    const hoy = new Date();
    hoy.setHours(23, 59, 59, 999);
    const fin = hoy.getTime();
    
    const inicio = new Date(hoy);
    inicio.setDate(inicio.getDate() - dias);
    inicio.setHours(0, 0, 0, 0);
    const inicioTimestamp = inicio.getTime();

    await Promise.all([
      cargarDatosPorRango(CONFIG.TIPOS.POLLO, inicioTimestamp, fin),
      cargarDatosPorRango(CONFIG.TIPOS.PAVO, inicioTimestamp, fin)
    ]);
  };

  //cargar datos de un año en especifico
  const cargarDatosAnio = async (anio) => {
    const inicio = new Date(anio, 0, 1, 0, 0, 0, 0).getTime();
    const fin = new Date(anio, 11, 31, 23, 59, 59, 999).getTime();

    await Promise.all([
      cargarDatosPorRango(CONFIG.TIPOS.POLLO, inicio, fin),
      cargarDatosPorRango(CONFIG.TIPOS.PAVO, inicio, fin)
    ]);
  };

  //cargar datos de un mes en especificio
  const cargarDatosMes = async (anio, mes) => {
    const inicio = new Date(anio, mes - 1, 1, 0, 0, 0, 0).getTime();
    const fin = new Date(anio, mes, 0, 23, 59, 59, 999).getTime();

    await Promise.all([
      cargarDatosPorRango(CONFIG.TIPOS.POLLO, inicio, fin),
      cargarDatosPorRango(CONFIG.TIPOS.PAVO, inicio, fin)
    ]);
  };

  //poblar select con valores unicos
  const poblarSelect = (select, valores) => {
    if (!select) return;
    const valoresUnicos = Array.from(new Set(valores)).sort((a, b) => a - b);
    
    const fragment = document.createDocumentFragment();
    const optDefault = document.createElement("option");
    optDefault.value = "";
    optDefault.textContent = "--";
    fragment.appendChild(optDefault);
    
    valoresUnicos.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      fragment.appendChild(opt);
    });
    
    select.innerHTML = "";
    select.appendChild(fragment);
  };

  //filtrar datos segun año,mes y dia
  const filtrarDatos = (datos, anio, mes, dia) => {
    return datos.filter(d => {
      if (anio && d.date.getFullYear() !== parseInt(anio)) return false;
      if (mes && (d.date.getMonth() + 1) !== parseInt(mes)) return false;
      if (dia && d.date.getDate() !== parseInt(dia)) return false;
      return true;
    });
  };

  //filtro de horario nocturno (entre las 21:30PM a las 05:30AM)
  const filtroHorarioNocturno = (datos, diaRef, anio, mes) => {
    const anioRef = parseInt(anio) || new Date().getFullYear();
    const mesRef = parseInt(mes) || (new Date().getMonth() + 1);
    const diaReferencia = diaRef || new Date().getDate();

    const inicio = new Date(anioRef, mesRef - 1, diaReferencia - 1, 21, 30).getTime();
    const fin = new Date(anioRef, mesRef - 1, diaReferencia, 5, 30).getTime();

    return datos.filter(d => d.timestamp >= inicio && d.timestamp <= fin);
  };

  //agrupar nocturno por horas
  const agruparPorHoraNocturna = (datos) => {
    const horasValidas = [21, 22, 23, 0, 1, 2, 3, 4, 5];
    const porHora = {};
    
    datos.forEach(d => {
      const h = d.date.getHours();
      if (horasValidas.includes(h)) {
        const key = `${h.toString().padStart(2, "0")}:00`;
        porHora[key] = (porHora[key] || 0) + d.caudal;
      }
    });
    
    const categorias = horasValidas.map(h => `${h.toString().padStart(2, "0")}:00`);
    const valores = categorias.map(k => porHora[k] || 0);
    return { categorias, valores };
  };

  //agrupar por meses
  const agruparPorMes = (datos) => {
    const porMes = {};
    datos.forEach(d => {
      const key = `${(d.date.getMonth() + 1).toString().padStart(2, '0')}-${d.date.getFullYear()}`;
      porMes[key] = (porMes[key] || 0) + d.caudal;
    });
    const categorias = Object.keys(porMes).sort();
    return { categorias, valores: categorias.map(k => porMes[k]) };
  };

  //agrupar por dias
  const agruparPorDia = (datos) => {
    const porDia = {};
    datos.forEach(d => {
      const key = `${d.date.getDate().toString().padStart(2, '0')}-${(d.date.getMonth() + 1).toString().padStart(2, '0')}`;
      porDia[key] = (porDia[key] || 0) + d.caudal;
    });
    const categorias = Object.keys(porDia).sort();
    return { categorias, valores: categorias.map(k => porDia[k]) };
  };

  //agrupar por horas
  const agruparPorHora = (datos) => {
    const porHora = {};
    datos.forEach(d => {
      const h = d.date.getHours();
      const key = `${h.toString().padStart(2, '0')}:00`;
      porHora[key] = (porHora[key] || 0) + d.caudal;
    });
    const categorias = Object.keys(porHora).sort((a, b) => parseInt(a) - parseInt(b));
    return { categorias, valores: categorias.map(k => porHora[k]) };
  };

  //Agrupar por semanas (martes a viernes)
  //Esta función agrupa los datos en semanas basándose en martes como inicio de semana
  //Solo cuenta los días de martes a viernes de cada semana
  const agruparPorSemana = (datos) => {
    const porSemana = {};
    
    datos.forEach(d => {
      const fecha = new Date(d.date);
      const diaSemana = fecha.getDay();
      
      //calcular el martes de esa semana
      //si es martes (2), usar esa fecha
      //si es miércoles (3), jueves (4) o viernes (5), retroceder al martes
      let diasHastaMartes = 0;
      if (diaSemana === 2) diasHastaMartes = 0; //es martes
      else if (diaSemana === 3) diasHastaMartes = 1; //es miércoles
      else if (diaSemana === 4) diasHastaMartes = 2; //es jueves
      else if (diaSemana === 5) diasHastaMartes = 3; //es viernes
      
      //calcular la fecha del martes de esa semana
      const martes = new Date(fecha);
      martes.setDate(martes.getDate() - diasHastaMartes);
      martes.setHours(0, 0, 0, 0);
      
      //crear clave de semana: "Semana DD/MM"
      const key = `Semana ${martes.getDate().toString().padStart(2, '0')}/${(martes.getMonth() + 1).toString().padStart(2, '0')}`;
      
      //sumar el caudal a esa semana
      porSemana[key] = (porSemana[key] || 0) + d.caudal;
    });
    
    //ordenar las semanas por fecha
    const categorias = Object.keys(porSemana).sort((a, b) => {
      const fechaA = a.split(' ')[1].split('/');
      const fechaB = b.split(' ')[1].split('/');
      const diaA = parseInt(fechaA[0]);
      const mesA = parseInt(fechaA[1]);
      const diaB = parseInt(fechaB[0]);
      const mesB = parseInt(fechaB[1]);
      
      if (mesA !== mesB) return mesA - mesB;
      return diaA - diaB;
    });
    
    return { 
      categorias, 
      valores: categorias.map(k => porSemana[k]) 
    };
  };

  //Filtrar últimas 4 semanas
  //Esta función filtra los datos para obtener solo las últimas 4 semanas
  //contando desde el último viernes disponible en los datos
  const filtrarUltimas4Semanas = (datos) => {
    if (datos.length === 0) return [];
    
    //encontrar el último viernes en los datos
    let ultimoViernes = null;
    for (let i = datos.length - 1; i >= 0; i--) {
      if (datos[i].date.getDay() === 5) { //5 = viernes
        ultimoViernes = new Date(datos[i].date);
        ultimoViernes.setHours(23, 59, 59, 999);
        break;
      }
    }
    
    if (!ultimoViernes) {
      //si no hay viernes, usar la fecha más reciente
      ultimoViernes = new Date(datos[datos.length - 1].date);
      ultimoViernes.setHours(23, 59, 59, 999);
    }
    
    //calcular el inicio: 4 semanas atrás desde el último viernes
    //cada semana tiene 7 días, entonces 4 semanas = 28 días
    const inicioRango = new Date(ultimoViernes);
    inicioRango.setDate(inicioRango.getDate() - 27); //27 días atrás + el día actual = 28 días
    inicioRango.setHours(0, 0, 0, 0);
    
    //filtrar datos dentro del rango
    return datos.filter(d => {
      const fecha = d.date.getTime();
      return fecha >= inicioRango.getTime() && fecha <= ultimoViernes.getTime();
    });
  };

  //sumar total
  const sumar = datos => datos.reduce((acc, d) => acc + d.caudal, 0);

  //filtrar datos entre las 21:00PM y 03:55AM del dia seleccionado
  const filtrarDatosNoche = (datos, anio, mes, dia) => {
    if (!anio || !mes || !dia) return [];
    const fechaInicio = new Date(anio, mes - 1, dia, 21, 0, 0, 0).getTime();
    const fechaFin = new Date(anio, mes - 1, parseInt(dia) + 1, 3, 55, 0, 0).getTime();
    return datos.filter(d => d.timestamp >= fechaInicio && d.timestamp <= fechaFin);
  };

  //filtrar datos de la ultima semana
  const filtrarUltimaSemana = (datos) => {
    const hoy = new Date();
    hoy.setHours(23, 59, 59, 999);
    const hace7dias = new Date(hoy.getTime() - 6 * 24 * 60 * 60 * 1000);
    hace7dias.setHours(0, 0, 0, 0);
    return datos.filter(d => d.date >= hace7dias && d.date <= hoy);
  };

  //renderizar graficos
  const renderGraficos = (anio, mes, dia) => {
    //filtrar datos
    let polloFiltrado, pavoFiltrado;

    //si hay filtro de dia, mostrar solo datos nocturnos (de 21:00PM a 03:55AM)
    if (anio && mes && dia) {
      polloFiltrado = filtrarDatosNoche(datosPolloCompletos, anio, mes, dia);
      pavoFiltrado = filtrarDatosNoche(datosPavoCompletos, anio, mes, dia);
    } else if (!anio && !mes && !dia) {
      //si no hay filtros, mostrar ultima semana
      polloFiltrado = filtrarUltimaSemana(datosPolloCompletos);
      pavoFiltrado = filtrarUltimaSemana(datosPavoCompletos);
    } else {
      //filtros normales
      polloFiltrado = filtrarDatos(datosPolloCompletos, anio, mes, dia);
      pavoFiltrado = filtrarDatos(datosPavoCompletos, anio, mes, dia);
    }

    //nocturnos
    const polloNocturno = filtroHorarioNocturno(datosPolloCompletos, dia, anio, mes);
    const pavoNocturno = filtroHorarioNocturno(datosPavoCompletos, dia, anio, mes);
    const { categorias: catPolloN, valores: valPolloN } = agruparPorHoraNocturna(polloNocturno);
    const { categorias: catPavoN, valores: valPavoN } = agruparPorHoraNocturna(pavoNocturno);

    //calcular totales nocturnos
    const totalPolloNocturno = valPolloN.reduce((sum, val) => sum + val, 0);
    const totalPavoNocturno = valPavoN.reduce((sum, val) => sum + val, 0);
    const totalNocturnoGeneral = totalPolloNocturno + totalPavoNocturno;

    //grafico nocturno
    //aca en el tooltip se muestra la suma total de las 2 areas tambien
    Highcharts.chart("grafico-nocturno-unificado", {
      chart: { type: "column" },
      title: { 
        text: 'Consumo nocturno'
      },
      subtitle: {
        text: `Total: ${formatearNumero(totalNocturnoGeneral)} m³`
      },
      xAxis: { 
        categories: catPolloN,
        title: { text: "Hora" }
      },
      yAxis: { 
        min: 0,
        title: { text: "Consumo (m³)" }
      },
      tooltip: {
        shared: true,
        valueDecimals: 2,
        valueSuffix: ' m³',
        //formatter personalizado para mostrar la suma total
        formatter: function() {
          let tooltip = '<b>' + this.x + '</b><br/>';
          let total = 0;
          
          //recorrer todos los puntos en esta categoría
          this.points.forEach(function(point) {
            tooltip += '<span style="color:' + point.color + '">\u25CF</span> ' + 
                      point.series.name + ': <b>' + 
                      formatearNumero(point.y) + ' m³</b><br/>';
            total += point.y;
          });
          
          //agregar la suma total al final del tooltip
          tooltip += '<br/><b>Total: ' + formatearNumero(total) + ' m³</b>';
          
          return tooltip;
        }
      },
      plotOptions: {
        column: {
          stacking: 'normal'
        }
      },
      series: [{
        name: "Pollo",
        data: valPolloN,
        color: '#4472C4',
        stack: 'nocturno'
      }, {
        name: "Pavo",
        data: valPavoN,
        color: '#ED7D31',
        stack: 'nocturno'
      }]
    });

    //graficos hidricos segun filtro
    let agrupador = agruparPorMes;
    if (anio && mes && dia) agrupador = agruparPorHora;
    else if (mes) agrupador = agruparPorDia;
    else if (anio) agrupador = agruparPorMes;
    else agrupador = agruparPorDia;

    const polloAgrupado = agrupador(polloFiltrado);
    const pavoAgrupado = agrupador(pavoFiltrado);

    //calcular totales para el grafico comparativo
    const totalPollo = sumar(polloFiltrado);
    const totalPavo = sumar(pavoFiltrado);
    const totalComparativo = totalPollo + totalPavo;

    //grafico consumo hidrico
    //aca en el tooltip se muestra la suma total de las 2 areas tambien
    Highcharts.chart("grafico-comparativo", {
      chart: { 
        type: "column"
      },
      title: { 
        text: 'Comparación consumo hídrico'
      },
      subtitle: {
        text: `Consumo total: ${formatearNumero(totalComparativo)} m³`
      },
      xAxis: { 
        categories: polloAgrupado.categorias,
        title: { text: "Periodo" }
      },
      yAxis: { 
        min: 0,
        title: { text: "Consumo (m³)" }
      },
      tooltip: {
        shared: true,
        valueDecimals: 2,
        valueSuffix: ' m³',
        // Formatter personalizado para mostrar la suma total
        formatter: function() {
          let tooltip = '<b>' + this.x + '</b><br/>';
          let total = 0;
          
          // Recorrer todos los puntos en esta categoría
          this.points.forEach(function(point) {
            tooltip += '<span style="color:' + point.color + '">\u25CF</span> ' + 
                      point.series.name + ': <b>' + 
                      formatearNumero(point.y) + ' m³</b><br/>';
            total += point.y;
          });
          
          // Agregar la suma total al final del tooltip
          tooltip += '<br/><b>Total: ' + formatearNumero(total) + ' m³</b>';
          
          return tooltip;
        }
      },
      plotOptions: {
        column: {
          stacking: 'normal'
        }
      },
      series: [{
        name: 'Pollo',
        data: polloAgrupado.valores,
        color: '#4472C4',
        stack: 'consumo'
      }, {
        name: 'Pavo',
        data: pavoAgrupado.valores,
        color: '#ED7D31',
        stack: 'consumo'
      }]
    });

    //Consumo semanal (martes a viernes)
    //Este gráfico se oculta cuando se selecciona un día específico
    //Muestra las últimas 4 semanas cuando no hay filtros
    //Muestra todas las semanas del año cuando se filtra por año
    //Muestra las semanas del mes cuando se filtra por mes
    const graficoSemanal = document.getElementById("grafico-semanal");
    
    if (dia) {
      //si hay filtro de día, ocultar el gráfico semanal
      graficoSemanal.style.display = 'none';
    } else {
      //mostrar el gráfico semanal
      graficoSemanal.style.display = 'block';
      
      //determinar qué datos usar según los filtros
      let datosSemanaPollo, datosSemanasPavo;
      
      if (!anio && !mes) {
        //sin filtros: mostrar últimas 4 semanas
        datosSemanaPollo = filtrarUltimas4Semanas(datosPolloCompletos);
        datosSemanasPavo = filtrarUltimas4Semanas(datosPavoCompletos);
      } else {
        //con filtros de año o mes: usar datos filtrados
        datosSemanaPollo = polloFiltrado;
        datosSemanasPavo = pavoFiltrado;
      }
      
      //agrupar por semanas
      const polloSemanal = agruparPorSemana(datosSemanaPollo);
      const pavoSemanal = agruparPorSemana(datosSemanasPavo);
      
      //calcular totales semanales
      const totalPolloSemanal = polloSemanal.valores.reduce((sum, val) => sum + val, 0);
      const totalPavoSemanal = pavoSemanal.valores.reduce((sum, val) => sum + val, 0);
      const totalSemanalGeneral = totalPolloSemanal + totalPavoSemanal;
      
      //determinar el título según el filtro aplicado
      let tituloSemanal = 'Consumo semanal (Mar-Vie)';
      if (!anio && !mes) {
        tituloSemanal = 'Consumo últimas 4 semanas (Mar-Vie)';
      } else if (anio && mes) {
        tituloSemanal = `Consumo semanal ${mes}/${anio} (Mar-Vie)`;
      } else if (anio) {
        tituloSemanal = `Consumo semanal ${anio} (Mar-Vie)`;
      }
      
      //renderizar gráfico semanal
      Highcharts.chart("grafico-semanal", {
        chart: { type: "column" },
        title: { 
          text: tituloSemanal
        },
        subtitle: {
          text: `Total: ${formatearNumero(totalSemanalGeneral)} m³`
        },
        xAxis: { 
          categories: polloSemanal.categorias,
          title: { text: "Semana" }
        },
        yAxis: { 
          min: 0,
          title: { text: "Consumo (m³)" }
        },
        tooltip: {
          shared: true,
          valueDecimals: 2,
          valueSuffix: ' m³',
          //formatter personalizado para mostrar la suma total de la semana
          formatter: function() {
            let tooltip = '<b>' + this.x + '</b><br/>';
            let total = 0;
            
            //recorrer todos los puntos en esta semana
            this.points.forEach(function(point) {
              tooltip += '<span style="color:' + point.color + '">\u25CF</span> ' + 
                        point.series.name + ': <b>' + 
                        formatearNumero(point.y) + ' m³</b><br/>';
              total += point.y;
            });
            
            //agregar la suma total de la semana
            tooltip += '<br/><b>Total semana: ' + formatearNumero(total) + ' m³</b>';
            
            return tooltip;
          }
        },
        plotOptions: {
          column: {
            stacking: 'normal'
          }
        },
        series: [{
          name: "Pollo",
          data: polloSemanal.valores,
          color: '#4472C4',
          stack: 'semanal'
        }, {
          name: "Pavo",
          data: pavoSemanal.valores,
          color: '#ED7D31',
          stack: 'semanal'
        }]
      });
    }

    //acumulados
    const totalPolloAcum = sumar(polloFiltrado);
    const totalPavoAcum = sumar(pavoFiltrado);

    //grafico de consumos acumulados
    Highcharts.chart("grafico-acumulados", {
      chart: { type: "bar" },
      title: { text: "Consumo acumulado" },
      xAxis: { categories: ["Diario", "Semanal", "Mensual"] },
      yAxis: { title: { text: "m³" } },
      series: [
        { name: "Pollo", data: [totalPolloAcum, totalPolloAcum * 7, totalPolloAcum * 30], color: '#4472C4' },
        { name: "Pavo", data: [totalPavoAcum, totalPavoAcum * 7, totalPavoAcum * 30], color: '#ED7D31' }
      ],
      tooltip: { valueDecimals: 2, valueSuffix: ' m³' }
    });
  };

  //manejar cambios en filtros con carga bajo demanda
  const manejarFiltros = async () => {
    const anio = filtroAnio.value;
    const mes = filtroMes.value;
    const dia = filtroDia.value;

    //cargar datos necesarios si no estan en cache
    if (anio && mes) {
      loader.style.display = "flex";
      await cargarDatosMes(parseInt(anio), parseInt(mes));
      loader.style.display = "none";
    } else if (anio) {
      loader.style.display = "flex";
      await cargarDatosAnio(parseInt(anio));
      loader.style.display = "none";
    }

    renderGraficos(anio, mes, dia);
  };

  //boton limpiar
  botonLimpiar.addEventListener("click", () => {
    filtroAnio.value = "";
    filtroMes.value = "";
    filtroDia.value = "";
    filtroMes.disabled = true;
    filtroDia.disabled = true;
    renderGraficos('', '', '');
  });

  //listeners filtros
  filtroAnio.addEventListener("change", async () => {
    const anio = filtroAnio.value;
    filtroMes.disabled = !anio;
    filtroDia.disabled = true;
    filtroMes.value = "";
    filtroDia.value = "";

    if (anio) {
      //cargar datos del año si no estan cargados
      loader.style.display = "flex";
      await cargarDatosAnio(parseInt(anio));
      loader.style.display = "none";

      //poblar meses disponibles
      const mesesPollo = datosPolloCompletos
        .filter(d => d.date.getFullYear() === parseInt(anio))
        .map(d => d.date.getMonth() + 1);
      const mesesPavo = datosPavoCompletos
        .filter(d => d.date.getFullYear() === parseInt(anio))
        .map(d => d.date.getMonth() + 1);
      const meses = Array.from(new Set(mesesPollo.concat(mesesPavo)));
      poblarSelect(filtroMes, meses);
    }

    await manejarFiltros();
  });

  filtroMes.addEventListener("change", async () => {
    const anio = filtroAnio.value;
    const mes = filtroMes.value;
    filtroDia.disabled = !(anio && mes);
    filtroDia.value = "";

    if (anio && mes) {
      //poblar dias disponibles
      const diasPollo = datosPolloCompletos
        .filter(d => d.date.getFullYear() === parseInt(anio) && (d.date.getMonth() + 1) === parseInt(mes))
        .map(d => d.date.getDate());
      const diasPavo = datosPavoCompletos
        .filter(d => d.date.getFullYear() === parseInt(anio) && (d.date.getMonth() + 1) === parseInt(mes))
        .map(d => d.date.getDate());
      const dias = Array.from(new Set(diasPollo.concat(diasPavo)));
      poblarSelect(filtroDia, dias);
    }

    await manejarFiltros();
  });

  filtroDia.addEventListener("change", manejarFiltros);

  //inicio, solo cargar los ultimos 7 dias
  loader.style.display = "flex";
  await cargarUltimosDias(CONFIG.DIAS_INICIALES);
  
  //poblar años disponibles
  const aniosPollo = datosPolloCompletos.map(d => d.date.getFullYear());
  const aniosPavo = datosPavoCompletos.map(d => d.date.getFullYear());
  
  //obtener todos los año posibles desde el CONFIG.INICIO_DATOS hasta la fecha actual
  const anioInicio = new Date(CONFIG.INICIO_DATOS).getFullYear();
  const anioActual = new Date().getFullYear();
  const todosLosAnios = [];
  for (let a = anioInicio; a <= anioActual; a++) {
    todosLosAnios.push(a);
  }
  
  poblarSelect(filtroAnio, todosLosAnios);
  
  loader.style.display = "none";
  container.style.display = "block";
  
  //renderizar graficos iniciales de los ultimos 7 dias
  renderGraficos('', '', '');
});