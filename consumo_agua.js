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
      POLLO: 'M3_PANTALON_POLLO',
      PAVO: 'M3_PANTALON_PAVO'
    },
    SENSOR: 'm2',
    DIAS_INICIALES: 7,
    INICIO_DATOS: 1744156800000,
    DIAS_VALIDOS: [2, 3, 4, 5]
  };

  //referencias del DOM
  const loader = document.getElementById("loader");
  const container = document.getElementById("container");
  const botonLimpiar = document.getElementById("limpiar-filtros");
  const filtroAnio = document.getElementById("filtro-anio");
  const filtroMes = document.getElementById("filtro-mes");
  const filtroDia = document.getElementById("filtro-dia");

  //formatear numeros con coma decimal y punto de miles
  const formatearNumero = (numero) => {
    const partes = numero.toFixed(2).split('.');
    partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return partes.join(',');
  };

  //cache optimizado con Maps - AHORA GUARDA TOTALIZADOR
  const cacheDatos = {
    pollo: new Map(),
    pavo: new Map()
  };

  //clase optimizada para gestionar rangos
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
        if (actual.inicio <= ultimo.fin + 86400000) {
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

  //construir URL de API
  const construirUrl = (tipo, sensor, inicio, fin) => {
    return `${CONFIG.API_URL}/${tipo}/${sensor}/${inicio}/${fin}`;
  };

  //peticion optimizada a la API
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
      return data.data?.data || [];
    } catch (e) {
      console.error(`error api ${tipo}:`, e);
      return [];
    }
  };

  //cargar datos por rango optimizado - CORREGIDO PARA USAR TOTALIZADOR
  const cargarDatosPorRango = async (tipo, inicio, fin) => {
    const esPollo = tipo === CONFIG.TIPOS.POLLO;
    const rangoManager = esPollo ? rangoManagerPollo : rangoManagerPavo;
    const cache = esPollo ? cacheDatos.pollo : cacheDatos.pavo;

    if (rangoManager.estaCargado(inicio, fin)) {
      return cache;
    }

    const rangosFaltantes = rangoManager.obtenerRangosFaltantes(inicio, fin);
    if (rangosFaltantes.length === 0) return cache;

    const promesas = rangosFaltantes.map(rango => {
      const url = construirUrl(tipo, CONFIG.SENSOR, rango.inicio, rango.fin);
      return getMedidores(url, tipo);
    });

    const resultados = await Promise.all(promesas);
    const nuevosDatos = resultados.flat();

    //agregar todos los datos a cache usando TOTALIZADOR
    nuevosDatos.forEach(item => {
      const timestamp = item.timestamp;
      const totalizador = parseFloat(item.totalizador) || 0;
      if (!isNaN(timestamp) && totalizador >= 0) {
        cache.set(timestamp, totalizador);
      }
    });

    rangoManager.agregar(inicio, fin);
    return cache;
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

  //cargar año completo
  const cargarDatosAnio = async (anio) => {
    const inicio = new Date(anio, 0, 1, 0, 0, 0, 0).getTime();
    const fin = new Date(anio, 11, 31, 23, 59, 59, 999).getTime();

    await Promise.all([
      cargarDatosPorRango(CONFIG.TIPOS.POLLO, inicio, fin),
      cargarDatosPorRango(CONFIG.TIPOS.PAVO, inicio, fin)
    ]);
  };

  //cargar mes especifico
  const cargarDatosMes = async (anio, mes) => {
    const inicio = new Date(anio, mes - 1, 1, 0, 0, 0, 0).getTime();
    const fin = new Date(anio, mes, 0, 23, 59, 59, 999).getTime();

    await Promise.all([
      cargarDatosPorRango(CONFIG.TIPOS.POLLO, inicio, fin),
      cargarDatosPorRango(CONFIG.TIPOS.PAVO, inicio, fin)
    ]);
  };

  //poblar select
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

  //obtener meses disponibles para un año especifico
  const obtenerMesesDisponibles = (anio) => {
    const meses = new Set();
    const anioNum = parseInt(anio);
    
    console.log(`Buscando meses para año ${anioNum}`);
    console.log(`Total registros pollo: ${cacheDatos.pollo.size}`);
    console.log(`Total registros pavo: ${cacheDatos.pavo.size}`);
    
    //buscar en datos de pollo
    for (const [timestamp] of cacheDatos.pollo) {
      const date = new Date(timestamp);
      if (date.getFullYear() === anioNum) {
        meses.add(date.getMonth() + 1);
      }
    }
    
    //buscar en datos de pavo
    for (const [timestamp] of cacheDatos.pavo) {
      const date = new Date(timestamp);
      if (date.getFullYear() === anioNum) {
        meses.add(date.getMonth() + 1);
      }
    }
    
    const mesesArray = Array.from(meses).sort((a, b) => a - b);
    console.log(`Meses encontrados para ${anioNum}:`, mesesArray);
    
    return mesesArray;
  };

  //obtener dias disponibles para un año y mes especifico
  const obtenerDiasDisponibles = (anio, mes) => {
    const dias = new Set();
    const anioNum = parseInt(anio);
    const mesNum = parseInt(mes);
    
    //buscar en datos de pollo
    for (const [timestamp] of cacheDatos.pollo) {
      const date = new Date(timestamp);
      if (date.getFullYear() === anioNum && (date.getMonth() + 1) === mesNum) {
        dias.add(date.getDate());
      }
    }
    
    //buscar en datos de pavo
    for (const [timestamp] of cacheDatos.pavo) {
      const date = new Date(timestamp);
      if (date.getFullYear() === anioNum && (date.getMonth() + 1) === mesNum) {
        dias.add(date.getDate());
      }
    }
    
    return Array.from(dias).sort((a, b) => a - b);
  };

  //filtrar datos del cache - AHORA USA TOTALIZADOR
  const obtenerDatosFiltrados = (cache, anio, mes, dia) => {
    const datos = [];
    for (const [timestamp, totalizador] of cache) {
      const date = new Date(timestamp);
      if (anio && date.getFullYear() !== parseInt(anio)) continue;
      if (mes && (date.getMonth() + 1) !== parseInt(mes)) continue;
      if (dia && date.getDate() !== parseInt(dia)) continue;
      datos.push({ timestamp, date, totalizador });
    }
    return datos.sort((a, b) => a.timestamp - b.timestamp);
  };

  const obtenerDatosMes = (cache, anio, mes) => {
    const datos = [];
    for (const [timestamp, totalizador] of cache) {
      const date = new Date(timestamp);
      if (date.getFullYear() === anio && (date.getMonth() + 1) === mes) {
        datos.push({ timestamp, date, totalizador });
      }
    }
    return datos.sort((a, b) => a.timestamp - b.timestamp);
  };

  //filtro horario nocturno
  const filtroHorarioNocturno = (cache, diaRef, anio, mes) => {
    const anioRef = parseInt(anio) || new Date().getFullYear();
    const mesRef = parseInt(mes) || (new Date().getMonth() + 1);
    const diaReferencia = diaRef || new Date().getDate();

    const inicio = new Date(anioRef, mesRef - 1, diaReferencia - 1, 21, 30).getTime();
    const fin = new Date(anioRef, mesRef - 1, diaReferencia, 5, 30).getTime();

    const datos = [];
    for (const [timestamp, totalizador] of cache) {
      if (timestamp >= inicio && timestamp <= fin) {
        datos.push({ timestamp, date: new Date(timestamp), totalizador });
      }
    }
    return datos.sort((a, b) => a.timestamp - b.timestamp);
  };

  //calcular consumo por diferencia de totalizador por hora
  const calcularConsumoPorHora = (datos) => {
    const porHora = new Map();
    
    datos.forEach(d => {
      const h = d.date.getHours();
      const key = `${h.toString().padStart(2, "0")}:00`;
      
      if (!porHora.has(key)) {
        porHora.set(key, []);
      }
      porHora.get(key).push(d);
    });

    const consumoPorHora = new Map();
    for (const [hora, registros] of porHora) {
      if (registros.length > 0) {
        registros.sort((a, b) => a.timestamp - b.timestamp);
        const primero = registros[0].totalizador;
        const ultimo = registros[registros.length - 1].totalizador;
        const consumo = Math.max(0, ultimo - primero);
        consumoPorHora.set(hora, consumo);
      }
    }

    return consumoPorHora;
  };

  //agrupar por hora nocturna usando diferencia de totalizador
  const agruparPorHoraNocturna = (datos) => {
    const horasValidas = [21, 22, 23, 0, 1, 2, 3, 4, 5];
    const consumoPorHora = calcularConsumoPorHora(datos);

    const categorias = horasValidas.map(h => `${h.toString().padStart(2, "0")}:00`);
    const valores = categorias.map(k => consumoPorHora.get(k) || 0);
    return { categorias, valores };
  };

  //calcular consumo por diferencia de totalizador por día
  const calcularConsumoPorDia = (datos) => {
    const porDia = new Map();
    
    datos.forEach(d => {
      const key = `${d.date.getDate().toString().padStart(2, '0')}-${(d.date.getMonth() + 1).toString().padStart(2, '0')}-${d.date.getFullYear()}`;
      
      if (!porDia.has(key)) {
        porDia.set(key, []);
      }
      porDia.get(key).push(d);
    });

    const consumoPorDia = new Map();
    for (const [dia, registros] of porDia) {
      if (registros.length > 0) {
        registros.sort((a, b) => a.timestamp - b.timestamp);
        const primero = registros[0].totalizador;
        const ultimo = registros[registros.length - 1].totalizador;
        const consumo = Math.max(0, ultimo - primero);
        consumoPorDia.set(dia, consumo);
      }
    }

    return consumoPorDia;
  };

  //agrupar por dia usando diferencia de totalizador
  const agruparPorDia = (datos) => {
    const consumoPorDia = calcularConsumoPorDia(datos);
    
    const categorias = Array.from(consumoPorDia.keys()).sort((a, b) => {
      const [diaA, mesA, anioA] = a.split('-').map(Number);
      const [diaB, mesB, anioB] = b.split('-').map(Number);
      if (anioA !== anioB) return anioA - anioB;
      if (mesA !== mesB) return mesA - mesB;
      return diaA - diaB;
    });
    
    return { categorias, valores: categorias.map(k => consumoPorDia.get(k)) };
  };

  //calcular consumo por diferencia de totalizador por mes
  const calcularConsumoPorMes = (datos) => {
    const porMes = new Map();
    
    datos.forEach(d => {
      const key = `${(d.date.getMonth() + 1).toString().padStart(2, '0')}-${d.date.getFullYear()}`;
      
      if (!porMes.has(key)) {
        porMes.set(key, []);
      }
      porMes.get(key).push(d);
    });

    const consumoPorMes = new Map();
    for (const [mes, registros] of porMes) {
      if (registros.length > 0) {
        registros.sort((a, b) => a.timestamp - b.timestamp);
        const primero = registros[0].totalizador;
        const ultimo = registros[registros.length - 1].totalizador;
        const consumo = Math.max(0, ultimo - primero);
        consumoPorMes.set(mes, consumo);
      }
    }

    return consumoPorMes;
  };

  //agrupar por mes usando diferencia de totalizador
  const agruparPorMes = (datos) => {
    const consumoPorMes = calcularConsumoPorMes(datos);
    
    const categorias = Array.from(consumoPorMes.keys()).sort((a, b) => {
      const [mesA, anioA] = a.split('-').map(Number);
      const [mesB, anioB] = b.split('-').map(Number);
      if (anioA !== anioB) return anioA - anioB;
      return mesA - mesB;
    });
    
    return { categorias, valores: categorias.map(k => consumoPorMes.get(k)) };
  };

  //agrupar por hora usando diferencia de totalizador
  const agruparPorHora = (datos) => {
    const consumoPorHora = calcularConsumoPorHora(datos);
    
    const categorias = Array.from(consumoPorHora.keys()).sort((a, b) => parseInt(a) - parseInt(b));
    return { categorias, valores: categorias.map(k => consumoPorHora.get(k)) };
  };

  //calcular consumo por semana usando diferencia de totalizador
  const calcularConsumoPorSemana = (datos) => {
    const porSemana = new Map();

    datos.forEach(d => {
      const fecha = new Date(d.date);
      const diaSemana = fecha.getDay();

      if (!CONFIG.DIAS_VALIDOS.includes(diaSemana)) {
        return;
      }

      let diasHastaMartes = 0;
      if (diaSemana === 2) diasHastaMartes = 0;
      else if (diaSemana === 3) diasHastaMartes = 1;
      else if (diaSemana === 4) diasHastaMartes = 2;
      else if (diaSemana === 5) diasHastaMartes = 3;

      const martes = new Date(fecha);
      martes.setDate(martes.getDate() - diasHastaMartes);
      martes.setHours(0, 0, 0, 0);

      const key = `Semana ${martes.getDate().toString().padStart(2, '0')}/${(martes.getMonth() + 1).toString().padStart(2, '0')}`;
      
      if (!porSemana.has(key)) {
        porSemana.set(key, []);
      }
      porSemana.get(key).push(d);
    });

    const consumoPorSemana = new Map();
    for (const [semana, registros] of porSemana) {
      if (registros.length > 0) {
        registros.sort((a, b) => a.timestamp - b.timestamp);
        const primero = registros[0].totalizador;
        const ultimo = registros[registros.length - 1].totalizador;
        const consumo = Math.max(0, ultimo - primero);
        consumoPorSemana.set(semana, consumo);
      }
    }

    return consumoPorSemana;
  };

  //agrupar por semana usando diferencia de totalizador
  const agruparPorSemana = (datos) => {
    const consumoPorSemana = calcularConsumoPorSemana(datos);

    const categorias = Array.from(consumoPorSemana.keys()).sort((a, b) => {
      const fechaA = a.split(' ')[1].split('/');
      const fechaB = b.split(' ')[1].split('/');
      const diaA = parseInt(fechaA[0]);
      const mesA = parseInt(fechaA[1]);
      const diaB = parseInt(fechaB[0]);
      const mesB = parseInt(fechaB[1]);
      if (mesA !== mesB) return mesA - mesB;
      return diaA - diaB;
    });

    return { categorias, valores: categorias.map(k => consumoPorSemana.get(k)) };
  };

  //calcular consumo total (diferencia entre último y primer totalizador)
  const calcularConsumoTotal = datos => {
    if (datos.length === 0) return 0;
    const ordenado = [...datos].sort((a, b) => a.timestamp - b.timestamp);
    const primero = ordenado[0].totalizador;
    const ultimo = ordenado[ordenado.length - 1].totalizador;
    return Math.max(0, ultimo - primero);
  };

  //filtrar datos noche
  const filtrarDatosNoche = (cache, anio, mes, dia) => {
    if (!anio || !mes || !dia) return [];
    const fechaInicio = new Date(anio, mes - 1, dia, 21, 0, 0, 0).getTime();
    const fechaFin = new Date(anio, mes - 1, parseInt(dia) + 1, 3, 55, 0, 0).getTime();

    const datos = [];
    for (const [timestamp, totalizador] of cache) {
      if (timestamp >= fechaInicio && timestamp <= fechaFin) {
        datos.push({ timestamp, date: new Date(timestamp), totalizador });
      }
    }
    return datos.sort((a, b) => a.timestamp - b.timestamp);
  };

  //filtrar ultima semana
  const filtrarUltimaSemana = (cache) => {
    const hoy = new Date();
    hoy.setHours(23, 59, 59, 999);
    const hace7dias = new Date(hoy.getTime() - 6 * 24 * 60 * 60 * 1000);
    hace7dias.setHours(0, 0, 0, 0);

    const datos = [];
    for (const [timestamp, totalizador] of cache) {
      const date = new Date(timestamp);
      if (date >= hace7dias && date <= hoy) {
        datos.push({ timestamp, date, totalizador });
      }
    }
    return datos.sort((a, b) => a.timestamp - b.timestamp);
  };

  //renderizar graficos
  const renderGraficos = (anio, mes, dia) => {
    let polloFiltrado, pavoFiltrado;

    if (anio && mes && dia) {
      polloFiltrado = filtrarDatosNoche(cacheDatos.pollo, anio, mes, dia);
      pavoFiltrado = filtrarDatosNoche(cacheDatos.pavo, anio, mes, dia);
    } else if (!anio && !mes && !dia) {
      polloFiltrado = filtrarUltimaSemana(cacheDatos.pollo);
      pavoFiltrado = filtrarUltimaSemana(cacheDatos.pavo);
    } else {
      polloFiltrado = obtenerDatosFiltrados(cacheDatos.pollo, anio, mes, dia);
      pavoFiltrado = obtenerDatosFiltrados(cacheDatos.pavo, anio, mes, dia);
    }

    // GRAFICO NOCTURNO
    const polloNocturno = filtroHorarioNocturno(cacheDatos.pollo, dia, anio, mes);
    const pavoNocturno = filtroHorarioNocturno(cacheDatos.pavo, dia, anio, mes);
    const { categorias: catPolloN, valores: valPolloN } = agruparPorHoraNocturna(polloNocturno);
    const { categorias: catPavoN, valores: valPavoN } = agruparPorHoraNocturna(pavoNocturno);

    const totalPolloNocturno = valPolloN.reduce((sum, val) => sum + val, 0);
    const totalPavoNocturno = valPavoN.reduce((sum, val) => sum + val, 0);
    const totalNocturnoGeneral = totalPolloNocturno + totalPavoNocturno;

    Highcharts.chart("grafico-nocturno-unificado", {
      chart: { type: "column" },
      title: { text: 'Consumo nocturno' },
      subtitle: { text: `Total: ${formatearNumero(totalNocturnoGeneral)} m³` },
      xAxis: { categories: catPolloN, title: { text: "Hora" } },
      yAxis: { min: 0, title: { text: "Consumo (m³)" } },
      tooltip: {
        shared: true,
        formatter: function() {
          let tooltip = '<b>' + this.x + '</b><br/>';
          let total = 0;
          this.points.forEach(function(point) {
            tooltip += '<span style="color:' + point.color + '">\u25CF</span> ' +
                      point.series.name + ': <b>' +
                      formatearNumero(point.y) + ' m³</b><br/>';
            total += point.y;
          });
          tooltip += '<br/><b>Total: ' + formatearNumero(total) + ' m³</b>';
          return tooltip;
        }
      },
      plotOptions: { column: { stacking: 'normal' } },
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

    // GRAFICO COMPARATIVO
    let agrupador = agruparPorDia;
    let tituloComparativo = 'Comparación consumo hídrico';

    if (anio && mes && dia) {
      agrupador = agruparPorHora;
      tituloComparativo = 'Comparación consumo hídrico por hora';
    } else if (anio && mes) {
      agrupador = agruparPorDia;
      tituloComparativo = 'Comparación consumo hídrico por día';
    } else if (anio) {
      agrupador = agruparPorMes;
      tituloComparativo = 'Comparación consumo hídrico por mes';
    } else {
      agrupador = agruparPorDia;
      tituloComparativo = 'Comparación consumo hídrico últimos 7 días';
    }

    const polloAgrupado = agrupador(polloFiltrado);
    const pavoAgrupado = agrupador(pavoFiltrado);

    const totalPollo = calcularConsumoTotal(polloFiltrado);
    const totalPavo = calcularConsumoTotal(pavoFiltrado);
    const totalComparativo = totalPollo + totalPavo;

    Highcharts.chart("grafico-comparativo", {
      chart: { type: "column" },
      title: { text: tituloComparativo },
      subtitle: { text: `Consumo total: ${formatearNumero(totalComparativo)} m³` },
      xAxis: {
        categories: polloAgrupado.categorias,
        title: { text: (anio && mes && dia) ? "Hora" : (anio && mes ? "Día" : (anio ? "Mes" : "Día")) }
      },
      yAxis: { min: 0, title: { text: "Consumo (m³)" } },
      tooltip: {
        shared: true,
        formatter: function() {
          let tooltip = '<b>' + this.x + '</b><br/>';
          let total = 0;
          this.points.forEach(function(point) {
            tooltip += '<span style="color:' + point.color + '">\u25CF</span> ' +
                      point.series.name + ': <b>' +
                      formatearNumero(point.y) + ' m³</b><br/>';
            total += point.y;
          });
          tooltip += '<br/><b>Total: ' + formatearNumero(total) + ' m³</b>';
          return tooltip;
        }
      },
      plotOptions: { column: { stacking: 'normal' } },
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

    // GRAFICO SEMANAL
    const graficoSemanal = document.getElementById("grafico-semanal");

    if (dia) {
      graficoSemanal.style.display = 'none';
    } else {
      graficoSemanal.style.display = 'block';

      let datosSemanaPollo, datosSemanasPavo;
      let tituloSemanal = 'Consumo semanal (Mar-Vie)';
      let categoriasSemanal = [];
      let valoresPolloSemanal = [];
      let valoresPavoSemanal = [];

      if (!anio && !mes) {
        const hoy = new Date();
        const currentYear = hoy.getFullYear();
        const currentMonth = hoy.getMonth() + 1;

        datosSemanaPollo = obtenerDatosMes(cacheDatos.pollo, currentYear, currentMonth);
        datosSemanasPavo = obtenerDatosMes(cacheDatos.pavo, currentYear, currentMonth);

        const polloSemanal = agruparPorSemana(datosSemanaPollo);
        const pavoSemanal = agruparPorSemana(datosSemanasPavo);

        tituloSemanal = `Consumo semanas ${currentMonth}/${currentYear} (Mar-Vie)`;
        categoriasSemanal = polloSemanal.categorias;
        valoresPolloSemanal = polloSemanal.valores;
        valoresPavoSemanal = pavoSemanal.valores;
      } else if (anio && !mes) {
        const year = parseInt(anio);

        const datosPolloAnio = obtenerDatosFiltrados(cacheDatos.pollo, year, null, null);
        const datosPavoAnio = obtenerDatosFiltrados(cacheDatos.pavo, year, null, null);

        const filtrarTueToFri = datos => datos.filter(d => CONFIG.DIAS_VALIDOS.includes(d.date.getDay()));

        const polloFiltradoTueFri = filtrarTueToFri(datosPolloAnio);
        const pavoFiltradoTueFri = filtrarTueToFri(datosPavoAnio);

        const polloMes = agruparPorMes(polloFiltradoTueFri);
        const pavoMes = agruparPorMes(pavoFiltradoTueFri);

        const categoriasUnion = Array.from(new Set([...polloMes.categorias, ...pavoMes.categorias])).sort((a,b) => {
          const [mA,yA] = a.split('-').map(Number);
          const [mB,yB] = b.split('-').map(Number);
          if (yA !== yB) return yA - yB;
          return mA - mB;
        });

        tituloSemanal = `Consumo mensual ${year} (Mar-Vie)`;
        categoriasSemanal = categoriasUnion;
        valoresPolloSemanal = categoriasUnion.map(k => polloMes.valores[polloMes.categorias.indexOf(k)] || 0);
        valoresPavoSemanal = categoriasUnion.map(k => pavoMes.valores[pavoMes.categorias.indexOf(k)] || 0);
      } else if (anio && mes) {
        const year = parseInt(anio);
        const month = parseInt(mes);

        datosSemanaPollo = obtenerDatosMes(cacheDatos.pollo, year, month);
        datosSemanasPavo = obtenerDatosMes(cacheDatos.pavo, year, month);

        const polloSemanal = agruparPorSemana(datosSemanaPollo);
        const pavoSemanal = agruparPorSemana(datosSemanasPavo);

        tituloSemanal = `Consumo semanas ${month}/${year} (Mar-Vie)`;
        categoriasSemanal = polloSemanal.categorias;
        valoresPolloSemanal = polloSemanal.valores;
        valoresPavoSemanal = pavoSemanal.valores;
      }

      categoriasSemanal = categoriasSemanal || [];
      valoresPolloSemanal = valoresPolloSemanal || [];
      valoresPavoSemanal = valoresPavoSemanal || [];

      const totalPolloSemanal = valoresPolloSemanal.reduce((sum, v) => sum + v, 0);
      const totalPavoSemanal = valoresPavoSemanal.reduce((sum, v) => sum + v, 0);
      const totalSemanalGeneral = totalPolloSemanal + totalPavoSemanal;

      Highcharts.chart("grafico-semanal", {
        chart: { type: "column" },
        title: { text: tituloSemanal },
        subtitle: { text: `Total: ${formatearNumero(totalSemanalGeneral)} m³` },
        xAxis: { categories: categoriasSemanal, title: { text: (anio && !mes) ? "Mes" : "Semana" } },
        yAxis: { min: 0, title: { text: "Consumo (m³)" } },
        tooltip: {
          shared: true,
          formatter: function() {
            let tooltip = '<b>' + this.x + '</b><br/>';
            let total = 0;
            this.points.forEach(function(point) {
              tooltip += '<span style="color:' + point.color + '">\u25CF</span> ' +
                        point.series.name + ': <b>' +
                        formatearNumero(point.y) + ' m³</b><br/>';
              total += point.y;
            });
            tooltip += '<br/><b>Total: ' + formatearNumero(total) + ' m³</b>';
            return tooltip;
          }
        },
        plotOptions: { column: { stacking: 'normal' } },
        series: [{
          name: "Pollo",
          data: valoresPolloSemanal,
          color: '#4472C4',
          stack: 'semanal'
        }, {
          name: "Pavo",
          data: valoresPavoSemanal,
          color: '#ED7D31',
          stack: 'semanal'
        }]
      });
    }

    // GRAFICO ACUMULADOS
    const totalPolloAcum = calcularConsumoTotal(polloFiltrado);
    const totalPavoAcum = calcularConsumoTotal(pavoFiltrado);

    Highcharts.chart("grafico-acumulados", {
      chart: { type: "bar" },
      title: { text: "Consumo acumulado" },
      xAxis: { categories: ["Diario", "Semanal", "Mensual"] },
      yAxis: { title: { text: "m³" } },
      tooltip: {
        formatter: function() {
          return '<b>' + this.series.name + '</b><br/>' +
                 this.x + ': <b>' + formatearNumero(this.y) + ' m³</b>';
        }
      },
      series: [
        { name: "Pollo", data: [totalPolloAcum, totalPolloAcum * 7, totalPolloAcum * 30], color: '#4472C4' },
        { name: "Pavo", data: [totalPavoAcum, totalPavoAcum * 7, totalPavoAcum * 30], color: '#ED7D31' }
      ]
    });
  };

  //manejar filtros
  const manejarFiltros = async () => {
    const anio = filtroAnio.value;
    const mes = filtroMes.value;
    const dia = filtroDia.value;

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
      loader.style.display = "flex";
      await cargarDatosAnio(parseInt(anio));
      
      //poblar meses disponibles DESPUES de cargar los datos
      const mesesDisponibles = obtenerMesesDisponibles(anio);
      poblarSelect(filtroMes, mesesDisponibles);
      
      loader.style.display = "none";
    } else {
      //si no hay año seleccionado, limpiar meses y dias
      poblarSelect(filtroMes, []);
      poblarSelect(filtroDia, []);
    }

    await manejarFiltros();
  });

  filtroMes.addEventListener("change", async () => {
    const anio = filtroAnio.value;
    const mes = filtroMes.value;
    filtroDia.disabled = !(anio && mes);
    filtroDia.value = "";

    if (anio && mes) {
      //poblar dias disponibles usando la funcion corregida
      const diasDisponibles = obtenerDiasDisponibles(anio, mes);
      poblarSelect(filtroDia, diasDisponibles);
    }

    await manejarFiltros();
  });

  filtroDia.addEventListener("change", manejarFiltros);

  //inicializacion
  loader.style.display = "flex";
  await cargarUltimosDias(CONFIG.DIAS_INICIALES);

  //poblar años disponibles
  const anioInicio = new Date(CONFIG.INICIO_DATOS).getFullYear();
  const anioActual = new Date().getFullYear();
  const todosLosAnios = [];
  for (let a = anioInicio; a <= anioActual; a++) {
    todosLosAnios.push(a);
  }
  poblarSelect(filtroAnio, todosLosAnios);

  filtroMes.disabled = true;
  filtroDia.disabled = true;

  loader.style.display = "none";
  container.style.display = "block";

  renderGraficos('', '', '');
});