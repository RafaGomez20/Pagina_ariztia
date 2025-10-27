//configuracion y constantes
const CONFIG = {
  API_URL: 'https://apimedidores.apidev.info/ariztia/getdetenciones_mes_annio',
  AUTH_TOKEN: 'paico2021', 
  DEBOUNCE_TIME: 300,
  MAX_CONCURRENT_REQUESTS: 6,
  MESES_MAP: {
    '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
    '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
    '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic'
  },
  MESES_DISPONIBLES: {
    '2024': ['Dic'],
    '2025': ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct']
  },
  RESPONSABLE_FILTRO: 'SSGG'
};

//cache mejorado con persistencia
class CacheManager {
  constructor() {
    this.cache = new Map();
    this.pending = new Map();
    this.loadFromSessionStorage();
  }

  getKey(anio, mes) {
    return `${anio}-${mes}`;
  }

  get(anio, mes) {
    return this.cache.get(this.getKey(anio, mes));
  }

  set(anio, mes, data) {
    const key = this.getKey(anio, mes);
    this.cache.set(key, data);
    this.saveToSessionStorage(key, data);
  }

  has(anio, mes) {
    return this.cache.has(this.getKey(anio, mes));
  }

  getPending(anio, mes) {
    return this.pending.get(this.getKey(anio, mes));
  }

  setPending(anio, mes, promise) {
    this.pending.set(this.getKey(anio, mes), promise);
  }

  clearPending(anio, mes) {
    this.pending.delete(this.getKey(anio, mes));
  }

  //guardar en sessionStorage para persistencia durante la sesion
  saveToSessionStorage(key, data) {
    try {
      sessionStorage.setItem(`cache_${key}`, JSON.stringify(data));
    } catch (e) {
      console.warn('No se pudo guardar en cache:', e);
    }
  }

  //cargar desde sessionStorage al iniciar
  loadFromSessionStorage() {
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key.startsWith('cache_')) {
          const cacheKey = key.replace('cache_', '');
          const data = JSON.parse(sessionStorage.getItem(key));
          this.cache.set(cacheKey, data);
        }
      }
    } catch (e) {
      console.warn('Error al cargar cache:', e);
    }
  }
}

//gestion de peticiones con control de concurrencia mejorado
class APIManager {
  constructor(maxConcurrent = 6) {
    this.maxConcurrent = maxConcurrent;
    this.queue = [];
    this.active = 0;
  }

  async fetch(url, options) {
    if (this.active >= this.maxConcurrent) {
      await new Promise(resolve => this.queue.push(resolve));
    }

    this.active++;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); //timeout 10s

      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeout);
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error en fetch:', error);
      throw error;
    } finally {
      this.active--;
      if (this.queue.length > 0) {
        const resolve = this.queue.shift();
        resolve();
      }
    }
  }
}

//funcion principal
const main__ = async () => {
  //referencias DOM
  const loader = document.getElementById("loader");
  const container = document.getElementById("container");
  const tablaDetallesContainer = document.getElementById("tabla-detalles-container");
  const pieChartContainer = document.getElementById("pie-chart-container");
  const filtroArea = document.getElementById('filtro-area');
  const filtroSeccion = document.getElementById('filtro-seccion');
  const filtroTPM = document.getElementById('filtro-tpm');
  const filtroDetencion = document.getElementById('filtro-detencion');
  const filtroAnio = document.getElementById('filtro-anio');
  const filtroMes = document.getElementById('filtro-mes');
  const filtroDia = document.getElementById('filtro-dia');
  const botonLimpiar = document.getElementById('limpiar-filtros');

  //estado global
  const cacheManager = new CacheManager();
  const apiManager = new APIManager(CONFIG.MAX_CONCURRENT_REQUESTS);
  let datosCompletos = [];
  let timeoutRender = null;

  //funciones de utilidad
  const normaliza = v => (v === null || v === undefined) ? '' : String(v).trim();

  const valoresUnicos = (arr, campo) => {
    const unicos = [...new Set(arr.map(i => normaliza(i[campo])).filter(v => v))];
    return campo === 'Dia' 
      ? unicos.sort((a, b) => parseInt(a) - parseInt(b))
      : unicos.sort();
  };

  const poblarSelect = (select, valores, valorActual = '') => {
    const valorPrevio = valorActual || select.value;
    const fragment = document.createDocumentFragment();
    
    const optionDefault = document.createElement('option');
    optionDefault.value = '';
    optionDefault.textContent = '--';
    fragment.appendChild(optionDefault);
    
    valores.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      fragment.appendChild(opt);
    });
    
    select.innerHTML = '';
    select.appendChild(fragment);
    
    if (valorPrevio && valores.includes(valorPrevio)) {
      select.value = valorPrevio;
    }
  };

  //carga de datos con cache
  const getDetencionesPorMesYAnio = async (anio, mes) => {
    if (cacheManager.has(anio, mes)) {
      return cacheManager.get(anio, mes);
    }

    const pending = cacheManager.getPending(anio, mes);
    if (pending) {
      return pending;
    }

    const url = `${CONFIG.API_URL}/${anio}/${mes}`;
    const promise = apiManager.fetch(url, {
      method: 'GET',
      headers: {
        'authorization': CONFIG.AUTH_TOKEN,
        'accept': 'application/json',
        'content-type': 'application/json'
      }
    })
    .then(data => {
      const resultado = (data.success && data.data?.data) ? data.data.data : [];
      const resultadoFiltrado = resultado.filter(item => normaliza(item['Desc Responsable']) === CONFIG.RESPONSABLE_FILTRO);
      cacheManager.set(anio, mes, resultadoFiltrado);
      cacheManager.clearPending(anio, mes);
      return resultadoFiltrado;
    })
    .catch(error => {
      console.error("Error en fetch:", error);
      cacheManager.clearPending(anio, mes);
      return [];
    });

    cacheManager.setPending(anio, mes, promise);
    return promise;
  };

  //OPTIMIZADO: carga paralela con Promise.all
  const cargarMultiplesMeses = async (anio, meses) => {
    const promesas = meses.map(mes => getDetencionesPorMesYAnio(anio, mes));
    const resultados = await Promise.all(promesas);
    return resultados.flat();
  };

  //NUEVO: precarga inteligente solo del mes actual
  const precargarMesActual = async () => {
    const hoy = new Date();
    const anioActual = hoy.getFullYear().toString();
    const mesActual = CONFIG.MESES_MAP[String(hoy.getMonth() + 1).padStart(2, '0')];
    
    if (mesActual) {
      setTimeout(() => {
        getDetencionesPorMesYAnio(anioActual, mesActual).catch(error => 
          console.log('Precarga mes actual:', error)
        );
      }, 500);
    }
  };

  //funciones para las fechas
  const obtenerUltimos7Dias = () => {
    const hoy = new Date();
    const dias = [];
    for (let i = 6; i >= 0; i--) {
      const fecha = new Date(hoy);
      fecha.setDate(hoy.getDate() - i);
      dias.push(fecha);
    }
    return dias;
  };

  const formatearFecha = (fecha) => {
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const anio = fecha.getFullYear();
    return `${dia}-${mes}-${anio}`;
  };

  const extraerDiaDeRegistro = (item) => {
    if (!item.Fecha) return '';
    const partes = item.Fecha.split('-');
    const primerNumero = parseInt(partes[0]);
    return primerNumero > 31 ? partes[2] : partes[0];
  };

  //grafico de pastel optimizado
  const renderGraficoPastel = (datos) => {
    if (!datos || datos.length === 0) {
      pieChartContainer.style.display = 'none';
      return;
    }

    const agrupado = datos.reduce((acc, item) => {
      const area = normaliza(item['Desc Area']) || 'Sin área';
      const seccion = normaliza(item['Desc Seccion']) || 'Sin sección';
      const key = `${area} - ${seccion}`;
      
      if (!acc[key]) {
        acc[key] = { minutos: 0, cantidad: 0 };
      }
      acc[key].minutos += (item.Minutos || 0);
      acc[key].cantidad++;
      return acc;
    }, {});

    const dataPie = Object.entries(agrupado)
      .map(([nombre, data]) => ({
        name: nombre,
        y: Math.round(data.minutos * 100) / 100,
        cantidad: data.cantidad
      }))
      .sort((a, b) => b.y - a.y)
      .slice(0, 10);

    const totalMinutos = dataPie.reduce((sum, item) => sum + item.y, 0);

    pieChartContainer.style.display = 'block';

    Highcharts.chart('pie-chart', {
      chart: { type: 'pie' },
      title: { 
        text: 'Distribución de Detenciones por Área y Sección',
        style: { fontSize: '18px', fontWeight: 'bold' }
      },
      subtitle: { 
        text: `Total: ${totalMinutos.toFixed(0)} minutos | ${datos.length} detenciones` 
      },
      tooltip: { 
        pointFormat: '<b>{point.name}</b><br/>Minutos: <b>{point.y:.1f}</b> ({point.percentage:.1f}%)<br/>Cantidad: {point.cantidad} detenciones',
        style: { fontSize: '12px' }
      },
      plotOptions: { 
        pie: { 
          allowPointSelect: true, 
          cursor: 'pointer', 
          dataLabels: { 
            enabled: true, 
            format: '<b>{point.name}</b><br/>{point.percentage:.1f}%',
            style: { fontSize: '10px' },
            distance: 10
          },
          showInLegend: true
        } 
      },
      legend: {
        enabled: true,
        layout: 'vertical',
        align: 'right',
        verticalAlign: 'middle',
        itemStyle: { fontSize: '11px' }
      },
      series: [{ 
        name: 'Minutos', 
        colorByPoint: true, 
        data: dataPie
      }],
      credits: { enabled: false }
    });
  };

  //grafico pareto inicial (solo ultimos 7 dias)
  const renderGraficoParetoInicial = async () => {
    loader.style.display = 'flex';
    container.innerHTML = '';
    tablaDetallesContainer.innerHTML = '';
    pieChartContainer.style.display = 'none';

    const ultimos7Dias = obtenerUltimos7Dias();
    const fechasFormateadas = ultimos7Dias.map(formatearFecha);
    
    const mesesACargar = new Map();
    ultimos7Dias.forEach(fecha => {
      const anio = fecha.getFullYear();
      const mes = String(fecha.getMonth() + 1).padStart(2, '0');
      const mesNombre = CONFIG.MESES_MAP[mes];
      const key = `${anio}`;
      
      if (!mesesACargar.has(key)) {
        mesesACargar.set(key, new Set());
      }
      mesesACargar.get(key).add(mesNombre);
    });

    const promesas = [];
    for (const [anio, meses] of mesesACargar) {
      promesas.push(cargarMultiplesMeses(anio, Array.from(meses)));
    }
    
    const resultados = await Promise.all(promesas);
    const datosUltimos7Dias = resultados.flat();

    const datosFiltrados = datosUltimos7Dias.filter(item => {
      if (!item.Fecha) return false;
      const partes = item.Fecha.split('-');
      const primerNumero = parseInt(partes[0]);
      const fechaItem = primerNumero > 31 
        ? `${partes[2]}-${partes[1]}-${partes[0]}`
        : item.Fecha.split(' ')[0];
      return fechasFormateadas.includes(fechaItem);
    });

    const tpmsAgrupadas = datosFiltrados.reduce((acc, item) => {
      const tipo = item['Desc TPM'] || 'Sin clasificar';
      if (!acc[tipo]) {
        acc[tipo] = { cantidad: 0, minutos: 0 };
      }
      acc[tipo].cantidad++;
      acc[tipo].minutos += (item.Minutos || 0);
      return acc;
    }, {});

    const tpmsOrdenadas = Object.entries(tpmsAgrupadas)
      .sort((a, b) => b[1].minutos - a[1].minutos)
      .slice(0, 10);

    const totalMinutos = tpmsOrdenadas.reduce((acc, [, data]) => acc + data.minutos, 0);
    let acumulado = 0;
    const datosPareto = tpmsOrdenadas.map(([nombre, data]) => {
      acumulado += data.minutos;
      return {
        nombre,
        minutos: Math.round(data.minutos),
        cantidad: data.cantidad,
        porcentajeAcumulado: (acumulado / totalMinutos * 100).toFixed(1)
      };
    });

    const divPareto = document.createElement("div");
    divPareto.id = "chart-pareto";
    divPareto.style.cssText = "width:100%;height:500px;margin-bottom:30px";
    container.appendChild(divPareto);

    Highcharts.chart('chart-pareto', {
      chart: { type: 'column' },
      title: { text: 'Diagrama de Pareto - Ultimos 7 Días' },
      subtitle: { 
        text: `Del ${fechasFormateadas[0]} al ${fechasFormateadas[6]} | Total: ${totalMinutos.toFixed(0)} minutos | Responsable: ${CONFIG.RESPONSABLE_FILTRO}` 
      },
      xAxis: [{
        categories: datosPareto.map(d => d.nombre),
        crosshair: true,
        labels: { rotation: -45, style: { fontSize: '10px' } }
      }],
      yAxis: [{
        min: 0,
        title: { text: 'Minutos de Detencion' }
      }, {
        min: 0,
        max: 100,
        title: { text: 'Porcentaje Acumulado (%)' },
        opposite: true
      }],
      tooltip: {
        shared: true,
        formatter: function() {
          const dato = datosPareto[this.points[0].point.index];
          return `<b>${dato.nombre}</b><br/>` +
                 `Minutos: <b>${dato.minutos}</b><br/>` +
                 `Cantidad: ${dato.cantidad} detenciones<br/>` +
                 `% Acumulado: ${dato.porcentajeAcumulado}%`;
        }
      },
      series: [{
        name: 'Minutos',
        type: 'column',
        data: datosPareto.map(d => d.minutos),
        color: '#3498db'
      }, {
        name: '% Acumulado',
        type: 'line',
        yAxis: 1,
        data: datosPareto.map(d => parseFloat(d.porcentajeAcumulado)),
        color: '#e74c3c',
        marker: { lineWidth: 2, lineColor: '#e74c3c', fillColor: 'white' }
      }],
      credits: { enabled: false }
    });

    renderTablaDetalle(datosFiltrados);

    loader.style.display = 'none';
    container.style.display = 'block';
  };

  //tabla de detalles optimizada con paginacion visual
  const renderTablaDetalle = (datos) => {
    tablaDetallesContainer.innerHTML = '';
    
    if (!datos.length) {
      tablaDetallesContainer.innerHTML = '<p class="text-center text-muted">No hay datos para mostrar</p>';
      return;
    }

    //limitar a 500 registros para mejor rendimiento
    const datosLimitados = datos.slice(0, 500);
    const hayMas = datos.length > 500;

    const filas = datosLimitados.map((item, index) => `
      <tr>
        <td class="small">${index + 1}</td>
        <td class="small">${item['Fecha'] || '-'}</td>
        <td class="small">${item['Desc Area'] || '-'}</td>
        <td class="small">${item['Desc Seccion'] || '-'}</td>
        <td class="small">${item['Desc TPM'] || '-'}</td>
        <td class="small">${item['Desc Turno'] || '-'}</td>
        <td class="small">${item['Desc Detencion'] || '-'}</td>
        <td class="small">${item.Observacion || '-'}</td>
        <td class="small">${item['Hora Inicio'] || '-'}</td>
        <td class="small">${item['Hora Termino'] || '-'}</td>
        <td class="small"><strong>${item.Minutos || 0}</strong></td>
      </tr>
    `).join('');

    const tabla = document.createElement('div');
    tabla.className = 'card p-3';
    tabla.innerHTML = `
      <h5 class="mb-3">Detalle de Detenciones (${datos.length} registros${hayMas ? ' - Mostrando primeros 500' : ''})</h5>
      <div class="table-responsive">
        <table class="table table-striped table-hover table-sm">
          <thead class="table-dark">
            <tr>
              <th class="small">#</th>
              <th class="small">Fecha</th>
              <th class="small">Desc Area</th>
              <th class="small">Desc Seccion</th>
              <th class="small">Desc TPM</th>
              <th class="small">Desc Tipo Detencion</th>
              <th class="small">Desc Turno</th>
              <th class="small">Observacion</th>
              <th class="small">Hora Inicio</th>
              <th class="small">Hora Termino</th>
              <th class="small">Minutos</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
    `;
    
    tablaDetallesContainer.appendChild(tabla);
  };

  //grafico por meses
  const renderGraficoPorMeses = (datos) => {
    container.innerHTML = '';
    tablaDetallesContainer.innerHTML = '';
    
    const datosPorMes = datos.reduce((acc, item) => {
      if (!item.Fecha) return acc;
      const partes = item.Fecha.split('-');
      const primerNumero = parseInt(partes[0]);
      const mesNumero = primerNumero > 31 ? partes[1] : partes[1];
      const mesNombre = CONFIG.MESES_MAP[mesNumero] || mesNumero;
      
      if (!acc[mesNombre]) acc[mesNombre] = [];
      acc[mesNombre].push(item);
      return acc;
    }, {});

    const ordenMeses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const mesesOrdenados = Object.keys(datosPorMes).sort((a, b) => 
      ordenMeses.indexOf(a) - ordenMeses.indexOf(b)
    );

    const minutosTotales = mesesOrdenados.map(mes => 
      Math.round(datosPorMes[mes].reduce((acc, item) => acc + (item.Minutos || 0), 0))
    );
    const cantidadDetenciones = mesesOrdenados.map(mes => datosPorMes[mes].length);

    const div = document.createElement("div");
    div.id = "chart-meses";
    div.style.cssText = "width:100%;height:500px;margin-bottom:20px";
    container.appendChild(div);

    Highcharts.chart('chart-meses', {
      chart: { type: 'column' },
      title: { text: `Detenciones por Mes - Año ${filtroAnio.value}` },
      subtitle: { text: 'Haga clic en un mes para ver detalles por día' },
      xAxis: { categories: mesesOrdenados, crosshair: true },
      yAxis: [{
        min: 0,
        title: { text: 'Minutos Totales' }
      }, {
        min: 0,
        title: { text: 'Cantidad de Detenciones' },
        opposite: true
      }],
      tooltip: { shared: true },
      plotOptions: {
        column: {
          cursor: 'pointer',
          point: {
            events: {
              click: function() {
                filtroMes.value = this.category;
                manejarFiltros('mes');
              }
            }
          }
        }
      },
      series: [{
        name: 'Minutos Totales',
        data: minutosTotales,
        color: '#3498db'
      }, {
        name: 'Cantidad Detenciones',
        data: cantidadDetenciones,
        yAxis: 1,
        color: '#e74c3c'
      }],
      credits: { enabled: false }
    });

    renderGraficoPastel(datos);
  };

  //grafico por dias
  const renderGraficoPorDias = (datos) => {
    container.innerHTML = '';
    tablaDetallesContainer.innerHTML = '';
    
    const datosPorDia = datos.reduce((acc, item) => {
      const dia = item.Dia;
      if (!dia) return acc;
      if (!acc[dia]) acc[dia] = [];
      acc[dia].push(item);
      return acc;
    }, {});

    const diasOrdenados = Object.keys(datosPorDia).sort((a, b) => parseInt(a) - parseInt(b));
    const minutosTotales = diasOrdenados.map(dia => 
      Math.round(datosPorDia[dia].reduce((acc, item) => acc + (item.Minutos || 0), 0))
    );
    const cantidadDetenciones = diasOrdenados.map(dia => datosPorDia[dia].length);

    const div = document.createElement("div");
    div.id = "chart-dias";
    div.style.cssText = "width:100%;height:500px;margin-bottom:20px";
    container.appendChild(div);

    Highcharts.chart('chart-dias', {
      chart: { type: 'column' },
      title: { text: `Detenciones por Dia - ${filtroMes.value} ${filtroAnio.value}` },
      subtitle: { text: 'Haga clic en un día para ver el detalle' },
      xAxis: { 
        categories: diasOrdenados,
        crosshair: true,
        title: { text: 'Día del Mes' }
      },
      yAxis: [{
        min: 0,
        title: { text: 'Minutos Totales' }
      }, {
        min: 0,
        title: { text: 'Cantidad de Detenciones' },
        opposite: true
      }],
      tooltip: { shared: true },
      plotOptions: {
        column: {
          cursor: 'pointer',
          point: {
            events: {
              click: function() {
                filtroDia.value = this.category;
                manejarFiltros('dia');
              }
            }
          }
        }
      },
      series: [{
        name: 'Minutos Totales',
        data: minutosTotales,
        color: '#2ecc71'
      }, {
        name: 'Cantidad Detenciones',
        data: cantidadDetenciones,
        yAxis: 1,
        color: '#e67e22'
      }],
      credits: { enabled: false }
    });

    renderGraficoPastel(datos);
    renderTablaDetalle(datos);
  };

  //grafico detalle dia
  const renderGraficoDetalleDia = (datos) => {
    container.innerHTML = '';
    
    if (!datos.length) {
      container.innerHTML = '<p style="color:red;padding:20px;">No hay datos para este día.</p>';
      tablaDetallesContainer.innerHTML = '';
      pieChartContainer.style.display = 'none';
      return;
    }

    const total = datos.reduce((acc, item) => acc + (item.Minutos || 0), 0);
    const promedio = (total / datos.length).toFixed(2);

    const detencionesAgrupadas = datos.reduce((acc, item) => {
      const tipo = item['Desc Detencion'] || 'Sin clasificar';
      if (!acc[tipo]) {
        acc[tipo] = { cantidad: 0, minutos: 0 };
      }
      acc[tipo].cantidad++;
      acc[tipo].minutos += (item.Minutos || 0);
      return acc;
    }, {});

    const tiposOrdenados = Object.entries(detencionesAgrupadas)
      .sort((a, b) => b[1].minutos - a[1].minutos);

    const categorias = tiposOrdenados.map(([tipo]) => tipo);
    const minutos = tiposOrdenados.map(([, data]) => Math.round(data.minutos));
    const cantidades = tiposOrdenados.map(([, data]) => data.cantidad);

    const div = document.createElement("div");
    div.id = "chart-detalle-dia";
    div.style.cssText = "width:100%;height:500px;margin-bottom:30px";
    container.appendChild(div);

    Highcharts.chart('chart-detalle-dia', {
      chart: { type: 'column' },
      title: { text: `Detalle del Día ${filtroDia.value}/${filtroMes.value}/${filtroAnio.value}` },
      subtitle: { 
        text: `Total: ${total.toFixed(0)} min | Promedio: ${promedio} min | ${datos.length} detenciones` 
      },
      xAxis: { 
        categories: categorias,
        crosshair: true,
        labels: { rotation: -45, style: { fontSize: '10px' } }
      },
      yAxis: [{
        min: 0,
        title: { text: 'Minutos Totales' }
      }, {
        min: 0,
        title: { text: 'Cantidad' },
        opposite: true
      }],
      tooltip: { shared: true },
      series: [{
        name: 'Minutos',
        data: minutos,
        color: '#9b59b6'
      }, {
        name: 'Cantidad',
        data: cantidades,
        yAxis: 1,
        color: '#f39c12'
      }],
      credits: { enabled: false }
    });

    renderGraficoPastel(datos);
    renderTablaDetalle(datos);
  };

  //grafico por area
  const renderGraficoArea = (area, datos) => {
    const divId = "chart-" + area.replace(/\s+/g, '-');
    const div = document.createElement("div");
    div.id = divId;
    div.style.cssText = "width:100%;height:400px;margin-bottom:40px";
    container.appendChild(div);

    const datosLimitados = datos.slice(0, 100);
    const minutos = datosLimitados.map(i => i.Minutos || 0);
    const fechas = datosLimitados.map(i => i.Fecha);
    const promedio = minutos.length 
      ? (minutos.reduce((a, b) => a + b, 0) / minutos.length).toFixed(2)
      : 0;
    const seccion = datos[0]?.['Desc Seccion'] || 'no definida';

    Highcharts.chart(divId, {
      chart: { type: 'column' },
      title: { text: `Area: ${area}` },
      subtitle: { 
        text: `Seccion: ${seccion} | Promedio: ${promedio} min | Mostrando ${datosLimitados.length} de ${datos.length} registros` 
      },
      xAxis: { 
        categories: fechas,
        crosshair: true,
        labels: { rotation: -45, style: { fontSize: '10px' } }
      },
      yAxis: { min: 0, title: { text: 'Minutos' } },
      tooltip: { valueSuffix: ' min' },
      plotOptions: {
        column: { pointPadding: 0.2, borderWidth: 0 }
      },
      series: [{ name: 'Minutos', data: minutos, color: '#34495e' }],
      credits: { enabled: false }
    });
  };

  const renderGraficosPorAreas = (datos, areaSeleccionada = '') => {
    container.innerHTML = '';
    tablaDetallesContainer.innerHTML = '';
    
    const areas = valoresUnicos(datos, 'Desc Area');
    if (!areas.length) {
      container.innerHTML = '<p style="color:red;padding:20px;">No hay datos para mostrar con los filtros seleccionados.</p>';
      pieChartContainer.style.display = 'none';
      return;
    }
    
    const areasLimitadas = areaSeleccionada ? [areaSeleccionada] : areas.slice(0, 5);
    
    areasLimitadas.forEach(area => {
      const datosArea = datos.filter(d => d['Desc Area'] === area);
      renderGraficoArea(area, datosArea);
    });

    if (!areaSeleccionada && areas.length > 5) {
      const msg = document.createElement('p');
      msg.style.cssText = 'color:#e67e22;padding:20px;font-weight:bold;';
      msg.textContent = `Mostrando 5 de ${areas.length} areas. Seleccione un area especifica para ver mas detalles.`;
      container.appendChild(msg);
    }

    renderGraficoPastel(datos);
    renderTablaDetalle(datos);
  };

  //OPTIMIZADO: manejo de filtros con carga bajo demanda
  const manejarFiltros = async (origenCambio = '') => {
    if (timeoutRender) clearTimeout(timeoutRender);

    const filtros = {
      anio: filtroAnio.value,
      mes: filtroMes.value,
      area: filtroArea.value,
      seccion: filtroSeccion.value,
      tpm: filtroTPM.value,
      detencion: filtroDetencion.value,
      dia: filtroDia.value
    };

    loader.style.display = 'flex';
    container.style.display = 'none';
    pieChartContainer.style.display = 'none';

    let datosFiltrados = [];

    if (filtros.anio) {
      //CLAVE: solo cargar el mes seleccionado, NO todo el año
      const mesesParaCargar = filtros.mes 
        ? [filtros.mes] 
        : CONFIG.MESES_DISPONIBLES[filtros.anio] || [];

      const acumulado = await cargarMultiplesMeses(filtros.anio, mesesParaCargar);

      datosCompletos = acumulado.map(item => ({
        ...item,
        Dia: extraerDiaDeRegistro(item)
      }));

      datosFiltrados = [...datosCompletos];
    }

    //aplicar filtros
    if (filtros.area) datosFiltrados = datosFiltrados.filter(i => normaliza(i['Desc Area']) === filtros.area);
    if (filtros.seccion) datosFiltrados = datosFiltrados.filter(i => normaliza(i['Desc Seccion']) === filtros.seccion);
    if (filtros.tpm) datosFiltrados = datosFiltrados.filter(i => normaliza(i['Desc TPM']) === filtros.tpm);
    if (filtros.detencion) datosFiltrados = datosFiltrados.filter(i => normaliza(i['Desc Detencion']) === filtros.detencion);
    if (filtros.dia) datosFiltrados = datosFiltrados.filter(i => String(i['Dia']) === filtros.dia);

    //preparar opciones de filtros en cascada
    let datosParaOpciones = [...datosCompletos];
    
    if (filtros.mes) {
      const mesesMapInverso = Object.fromEntries(
        Object.entries(CONFIG.MESES_MAP).map(([k, v]) => [v, k])
      );
      const mesNumero = mesesMapInverso[filtros.mes];
      datosParaOpciones = datosParaOpciones.filter(i => {
        if (!i.Fecha) return false;
        const partes = i.Fecha.split('-');
        const primerNumero = parseInt(partes[0]);
        const mesEnFecha = primerNumero > 31 ? partes[1] : partes[1];
        return mesEnFecha === mesNumero;
      });
    }
    
    if (filtros.dia) {
      datosParaOpciones = datosParaOpciones.filter(i => String(i.Dia) === filtros.dia);
    }
    
    const areasDisponibles = valoresUnicos(datosParaOpciones, 'Desc Area');
    
    if (filtros.area) datosParaOpciones = datosParaOpciones.filter(i => normaliza(i['Desc Area']) === filtros.area);
    const seccionesDisponibles = valoresUnicos(datosParaOpciones, 'Desc Seccion');
    
    if (filtros.seccion) datosParaOpciones = datosParaOpciones.filter(i => normaliza(i['Desc Seccion']) === filtros.seccion);
    const tpmsDisponibles = valoresUnicos(datosParaOpciones, 'Desc TPM');
    
    if (filtros.tpm) datosParaOpciones = datosParaOpciones.filter(i => normaliza(i['Desc TPM']) === filtros.tpm);
    const detencionesDisponibles = valoresUnicos(datosParaOpciones, 'Desc Detencion');
    
    let datosParaDias = [...datosCompletos];
    if (filtros.mes) {
      const mesesMapInverso = Object.fromEntries(
        Object.entries(CONFIG.MESES_MAP).map(([k, v]) => [v, k])
      );
      const mesNumero = mesesMapInverso[filtros.mes];
      datosParaDias = datosParaDias.filter(i => {
        if (!i.Fecha) return false;
        const partes = i.Fecha.split('-');
        const primerNumero = parseInt(partes[0]);
        const mesEnFecha = primerNumero > 31 ? partes[1] : partes[1];
        return mesEnFecha === mesNumero;
      });
    }
    const diasDisponibles = valoresUnicos(datosParaDias, 'Dia');

    //actualizar selectores
    if (origenCambio !== 'area') poblarSelect(filtroArea, areasDisponibles, filtros.area);
    if (origenCambio !== 'seccion') poblarSelect(filtroSeccion, seccionesDisponibles, filtros.seccion);
    if (origenCambio !== 'tpm') poblarSelect(filtroTPM, tpmsDisponibles, filtros.tpm);
    if (origenCambio !== 'detencion') poblarSelect(filtroDetencion, detencionesDisponibles, filtros.detencion);
    if (origenCambio !== 'dia') poblarSelect(filtroDia, diasDisponibles, filtros.dia);

    //estado de selectores
    filtroArea.disabled = !filtros.anio;
    filtroSeccion.disabled = !filtros.area;
    filtroTPM.disabled = !filtros.seccion;
    filtroDetencion.disabled = !filtros.tpm;
    filtroDia.disabled = !filtros.mes;

    //decidir tipo de grafico con debounce
    timeoutRender = setTimeout(() => {
      if (filtros.dia) {
        renderGraficoDetalleDia(datosFiltrados);
      } else if (filtros.mes) {
        renderGraficoPorDias(datosFiltrados);
      } else if (filtros.anio && !filtros.area) {
        renderGraficoPorMeses(datosFiltrados);
      } else {
        renderGraficosPorAreas(datosFiltrados, filtros.area);
      }

      loader.style.display = 'none';
      container.style.display = 'block';
    }, CONFIG.DEBOUNCE_TIME);
  };

  //limpiar filtros
  const limpiarFiltros = () => {
    filtroAnio.value = '';
    filtroMes.innerHTML = '<option value="">--</option>';
    filtroMes.disabled = true;
    filtroDia.innerHTML = '<option value="">--</option>';
    filtroDia.disabled = true;
    [filtroArea, filtroSeccion, filtroTPM, filtroDetencion].forEach(f => { 
      f.innerHTML = '<option value="">--</option>'; 
      f.disabled = true; 
    });
    datosCompletos = [];
    renderGraficoParetoInicial();
  };

  //inicializar filtros
  const inicializarFiltros = () => {
    const aniosDisponibles = ['2024', '2025'];
    poblarSelect(filtroAnio, aniosDisponibles);
    filtroMes.disabled = true;
    [filtroArea, filtroSeccion, filtroTPM, filtroDetencion, filtroDia].forEach(f => f.disabled = true);
  };

  //eventos
  filtroAnio.addEventListener('change', async () => {
    const anio = filtroAnio.value;
    filtroMes.innerHTML = '<option value="">--</option>';
    filtroDia.innerHTML = '<option value="">--</option>';
    
    if (anio) {
      const mesesAnio = CONFIG.MESES_DISPONIBLES[anio] || [];
      poblarSelect(filtroMes, mesesAnio);
    }
    
    filtroMes.disabled = !anio;
    filtroDia.disabled = true;
    await manejarFiltros();
  });

  filtroMes.addEventListener('change', () => manejarFiltros('mes'));
  filtroArea.addEventListener('change', () => manejarFiltros('area'));
  filtroSeccion.addEventListener('change', () => manejarFiltros('seccion'));
  filtroTPM.addEventListener('change', () => manejarFiltros('tpm'));
  filtroDetencion.addEventListener('change', () => manejarFiltros('detencion'));
  filtroDia.addEventListener('change', () => manejarFiltros('dia'));
  botonLimpiar.addEventListener('click', limpiarFiltros);

  //inicializacion
  inicializarFiltros();
  
  //precarga solo del mes actual en background
  precargarMesActual();
  
  //carga vista inicial rapida (solo ultimos 7 dias)
  await renderGraficoParetoInicial();
};

//ejecutar
main__();