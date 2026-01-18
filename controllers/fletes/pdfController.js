// controllers/fletes/pdfController.js - SISTEMA DE FLETES - DISEÑO MEJORADO
const pool = require('./dbPromise');
const PDFDocument = require('pdfkit');

// ✅ GENERAR PDF DE BALANCE
exports.generarPDFBalance = async (req, res) => {
  try {
    const { mes, año, camion_id } = req.query;

    console.log('📄 Generando PDF para:', { mes, año, camion_id });

    // Construir filtros
    const filtros = [];
    const params = [];

    if (mes && año) {
      filtros.push('YEAR(fecha) = ? AND MONTH(fecha) = ?');
      params.push(año, mes);
    }

    if (camion_id) {
      filtros.push('camion_id = ?');
      params.push(camion_id);
    }

    const whereClause = filtros.length > 0 ? `WHERE ${filtros.join(' AND ')}` : '';

    // Obtener ingresos
    const [ingresos] = await pool.execute(`
      SELECT i.*, c.patente, cat.nombre as categoria_nombre
      FROM ingresos i
      LEFT JOIN camiones c ON i.camion_id = c.id
      LEFT JOIN categorias cat ON i.categoria_id = cat.id
      ${whereClause}
      ORDER BY i.fecha DESC
    `, params);

    // Obtener gastos
    const [gastos] = await pool.execute(`
      SELECT g.*, c.patente, cat.nombre as categoria_nombre
      FROM gastos g
      LEFT JOIN camiones c ON g.camion_id = c.id
      LEFT JOIN categorias cat ON g.categoria_id = cat.id
      ${whereClause}
      ORDER BY g.fecha DESC
    `, params);

    // Calcular totales
    const totalIngresos = ingresos.reduce((sum, i) => sum + parseFloat(i.total), 0);
    const totalGastos = gastos.reduce((sum, g) => sum + parseFloat(g.total), 0);
    const balance = totalIngresos - totalGastos;

    console.log('📊 Datos:', { 
      ingresos: ingresos.length, 
      gastos: gastos.length, 
      totalIngresos, 
      totalGastos, 
      balance 
    });

    // Crear PDF
    const doc = new PDFDocument({ 
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 }
    });

    // Headers para descarga
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=FLETES - ${mes || 'Todos'}-${año || new Date().getFullYear()}.pdf`);

    // Pipe el PDF al response
    doc.pipe(res);

    // Función auxiliar de formato
    const fmt = (valor) => `$${parseFloat(valor).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Función para truncar texto con manejo inteligente
    const wrapText = (text, maxWidth) => {
      const words = text.split(' ');
      const lines = [];
      let currentLine = '';

      words.forEach(word => {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = doc.widthOfString(testLine);
        
        if (testWidth > maxWidth) {
          if (currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            // Palabra muy larga, dividirla
            lines.push(word.substring(0, Math.floor(maxWidth / 7)));
            currentLine = word.substring(Math.floor(maxWidth / 7));
          }
        } else {
          currentLine = testLine;
        }
      });
      
      if (currentLine) {
        lines.push(currentLine);
      }
      
      return lines;
    };

    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    const pageWidth = doc.page.width;
    const centerX = pageWidth / 2;

    // ===== HEADER DEL PDF =====
    doc.fontSize(24).font('Helvetica-Bold').text('REPORTE FINANCIERO', { align: 'center' });
    doc.fontSize(12).font('Helvetica').text('Sistema de Gestión de Fletes', { align: 'center' });
    doc.fontSize(10).text(`${mes ? meses[mes - 1] : 'Todos los meses'} ${año || new Date().getFullYear()}`, { align: 'center' });
    doc.moveDown(2);

    // ===== BALANCE GENERAL - CENTRADO =====
    const balanceTitle = 'BALANCE GENERAL';
    const titleWidth = doc.widthOfString(balanceTitle);
    doc.fontSize(16).font('Helvetica-Bold').text(balanceTitle, centerX - titleWidth / 2, doc.y);
    doc.moveDown(1);

    const startY = doc.y;
    const boxWidth = 150;
    const boxHeight = 60;
    const spacing = 15;
    const totalBoxesWidth = (boxWidth * 3) + (spacing * 2);
    const startX = (pageWidth - totalBoxesWidth) / 2;

    // Box Ingresos
    doc.rect(startX, startY, boxWidth, boxHeight).fillAndStroke('#f0fdf4', '#10b981');
    doc.fillColor('#000000').fontSize(9).font('Helvetica').text('TOTAL INGRESOS', startX + 10, startY + 10, { width: boxWidth - 20, align: 'center' });
    doc.fontSize(14).fillColor('#10b981').font('Helvetica-Bold').text(fmt(totalIngresos), startX + 10, startY + 30, { width: boxWidth - 20, align: 'center' });

    // Box Gastos
    doc.rect(startX + boxWidth + spacing, startY, boxWidth, boxHeight).fillAndStroke('#fef2f2', '#ef4444');
    doc.fillColor('#000000').fontSize(9).font('Helvetica').text('TOTAL GASTOS', startX + boxWidth + spacing + 10, startY + 10, { width: boxWidth - 20, align: 'center' });
    doc.fontSize(14).fillColor('#ef4444').font('Helvetica-Bold').text(fmt(totalGastos), startX + boxWidth + spacing + 10, startY + 30, { width: boxWidth - 20, align: 'center' });

    // Box Balance
    const balanceColor = balance >= 0 ? '#3b82f6' : '#f97316';
    const balanceBg = balance >= 0 ? '#eff6ff' : '#fff7ed';
    doc.rect(startX + (boxWidth + spacing) * 2, startY, boxWidth, boxHeight).fillAndStroke(balanceBg, balanceColor);
    doc.fillColor('#000000').fontSize(9).font('Helvetica').text('BALANCE NETO', startX + (boxWidth + spacing) * 2 + 10, startY + 10, { width: boxWidth - 20, align: 'center' });
    doc.fontSize(14).fillColor(balanceColor).font('Helvetica-Bold').text(fmt(balance), startX + (boxWidth + spacing) * 2 + 10, startY + 30, { width: boxWidth - 20, align: 'center' });

    doc.y = startY + boxHeight + 30;

    // ===== TABLA DE INGRESOS - CENTRADA =====
    const ingresosTitle = 'DETALLE DE INGRESOS';
    const ingresosTitleWidth = doc.widthOfString(ingresosTitle);
    doc.fillColor('#000000').fontSize(14).font('Helvetica-Bold').text(ingresosTitle, centerX - ingresosTitleWidth / 2, doc.y);
    doc.moveDown(0.5);

    if (ingresos.length > 0) {
      const tableWidth = 495;
      const tableStartX = (pageWidth - tableWidth) / 2;
      const col1Width = 70;
      const col2Width = 200;
      const col3Width = 120;
      const col4Width = 105;

      const col1 = tableStartX;
      const col2 = col1 + col1Width;
      const col3 = col2 + col2Width;
      const col4 = col3 + col3Width;

      const tableTop = doc.y;

      // Header de tabla
      doc.rect(col1, tableTop, tableWidth, 25).fill('#10b981');
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold');
      doc.text('Fecha', col1 + 5, tableTop + 8, { width: col1Width - 10, align: 'left' });
      doc.text('Descripción', col2 + 5, tableTop + 8, { width: col2Width - 10, align: 'left' });
      doc.text('Categoría', col3 + 5, tableTop + 8, { width: col3Width - 10, align: 'left' });
      doc.text('Monto', col4 + 5, tableTop + 8, { width: col4Width - 10, align: 'right' });

      let currentY = tableTop + 25;

      // Rows de ingresos con texto multilínea
      doc.fillColor('#000000').fontSize(9).font('Helvetica');
      ingresos.forEach((ingreso, index) => {
        // Calcular líneas necesarias para descripción
        const descripcionLines = wrapText(ingreso.nombre, col2Width - 10);
        const rowHeight = Math.max(20, descripcionLines.length * 12 + 8);

        if (currentY + rowHeight > doc.page.height - 100) {
          doc.addPage();
          currentY = 50;
        }

        const rowBg = index % 2 === 0 ? '#ffffff' : '#f9fafb';
        doc.rect(col1, currentY, tableWidth, rowHeight).fill(rowBg);

        doc.fillColor('#000000');
        
        // Fecha
        doc.text(new Date(ingreso.fecha).toLocaleDateString('es-AR'), col1 + 5, currentY + 5, { width: col1Width - 10 });
        
        // Descripción multilínea
        let descY = currentY + 5;
        descripcionLines.forEach(line => {
          doc.text(line, col2 + 5, descY, { width: col2Width - 10 });
          descY += 12;
        });
        
        // Categoría
        doc.text(ingreso.categoria_nombre || 'Sin categoría', col3 + 5, currentY + 5, { width: col3Width - 10 });
        
        // Monto
        doc.font('Helvetica-Bold').text(fmt(ingreso.total), col4 + 5, currentY + 5, { width: col4Width - 10, align: 'right' });
        doc.font('Helvetica');

        currentY += rowHeight;
      });

      // Footer de tabla
      doc.rect(col1, currentY, tableWidth, 25).fill('#f0fdf4');
      doc.fillColor('#15803d').fontSize(10).font('Helvetica-Bold');
      doc.text('TOTAL', col3 + 5, currentY + 8, { width: col3Width - 10, align: 'left' });
      doc.text(fmt(totalIngresos), col4 + 5, currentY + 8, { width: col4Width - 10, align: 'right' });

      doc.y = currentY + 35;
    } else {
      doc.fontSize(10).fillColor('#6b7280').text('No hay ingresos registrados en este período', { align: 'center' });
      doc.moveDown(1);
    }

    // ===== TABLA DE GASTOS - CENTRADA =====
    if (doc.y > doc.page.height - 150) {
      doc.addPage();
    }

    const gastosTitle = 'DETALLE DE GASTOS';
    const gastosTitleWidth = doc.widthOfString(gastosTitle);
    doc.fillColor('#000000').fontSize(14).font('Helvetica-Bold').text(gastosTitle, centerX - gastosTitleWidth / 2, doc.y);
    doc.moveDown(0.5);

    if (gastos.length > 0) {
      const tableWidth = 495;
      const tableStartX = (pageWidth - tableWidth) / 2;
      const col1Width = 70;
      const col2Width = 200;
      const col3Width = 120;
      const col4Width = 105;

      const col1 = tableStartX;
      const col2 = col1 + col1Width;
      const col3 = col2 + col2Width;
      const col4 = col3 + col3Width;

      const tableTop = doc.y;

      // Header de tabla
      doc.rect(col1, tableTop, tableWidth, 25).fill('#ef4444');
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold');
      doc.text('Fecha', col1 + 5, tableTop + 8, { width: col1Width - 10, align: 'left' });
      doc.text('Descripción', col2 + 5, tableTop + 8, { width: col2Width - 10, align: 'left' });
      doc.text('Categoría', col3 + 5, tableTop + 8, { width: col3Width - 10, align: 'left' });
      doc.text('Monto', col4 + 5, tableTop + 8, { width: col4Width - 10, align: 'right' });

      let currentY = tableTop + 25;

      // Rows de gastos con texto multilínea
      doc.fillColor('#000000').fontSize(9).font('Helvetica');
      gastos.forEach((gasto, index) => {
        // Calcular líneas necesarias para descripción
        const descripcionLines = wrapText(gasto.nombre, col2Width - 10);
        const rowHeight = Math.max(20, descripcionLines.length * 12 + 8);

        if (currentY + rowHeight > doc.page.height - 100) {
          doc.addPage();
          currentY = 50;
        }

        const rowBg = index % 2 === 0 ? '#ffffff' : '#f9fafb';
        doc.rect(col1, currentY, tableWidth, rowHeight).fill(rowBg);

        doc.fillColor('#000000');
        
        // Fecha
        doc.text(new Date(gasto.fecha).toLocaleDateString('es-AR'), col1 + 5, currentY + 5, { width: col1Width - 10 });
        
        // Descripción multilínea
        let descY = currentY + 5;
        descripcionLines.forEach(line => {
          doc.text(line, col2 + 5, descY, { width: col2Width - 10 });
          descY += 12;
        });
        
        // Categoría
        doc.text(gasto.categoria_nombre || 'Sin categoría', col3 + 5, currentY + 5, { width: col3Width - 10 });
        
        // Monto
        doc.font('Helvetica-Bold').text(fmt(gasto.total), col4 + 5, currentY + 5, { width: col4Width - 10, align: 'right' });
        doc.font('Helvetica');

        currentY += rowHeight;
      });

      // Footer de tabla
      doc.rect(col1, currentY, tableWidth, 25).fill('#fef2f2');
      doc.fillColor('#dc2626').fontSize(10).font('Helvetica-Bold');
      doc.text('TOTAL', col3 + 5, currentY + 8, { width: col3Width - 10, align: 'left' });
      doc.text(fmt(totalGastos), col4 + 5, currentY + 8, { width: col4Width - 10, align: 'right' });

      doc.y = currentY + 35;
    } else {
      doc.fontSize(10).fillColor('#6b7280').text('No hay gastos registrados en este período', { align: 'center' });
      doc.moveDown(1);
    }

    // ===== RESUMEN POR CATEGORÍA - CENTRADO =====
    if (gastos.length > 0) {
      if (doc.y > doc.page.height - 200) {
        doc.addPage();
      }

      const resumenTitle = 'RESUMEN POR CATEGORÍA';
      const resumenTitleWidth = doc.widthOfString(resumenTitle);
      doc.fillColor('#000000').fontSize(14).font('Helvetica-Bold').text(resumenTitle, centerX - resumenTitleWidth / 2, doc.y);
      doc.moveDown(0.5);

      const cats = {};
      gastos.forEach(g => {
        const cat = g.categoria_nombre || 'Sin categoría';
        cats[cat] = (cats[cat] || 0) + parseFloat(g.total);
      });

      const catData = Object.entries(cats).sort((a, b) => b[1] - a[1]);

      const tableWidth = 400;
      const tableStartX = (pageWidth - tableWidth) / 2;
      const col1Width = 200;
      const col2Width = 130;
      const col3Width = 70;

      const col1 = tableStartX;
      const col2 = col1 + col1Width;
      const col3 = col2 + col2Width;

      const tableTop = doc.y;

      // Header
      doc.rect(col1, tableTop, tableWidth, 25).fill('#475569');
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold');
      doc.text('Categoría', col1 + 5, tableTop + 8, { width: col1Width - 10, align: 'left' });
      doc.text('Total', col2 + 5, tableTop + 8, { width: col2Width - 10, align: 'right' });
      doc.text('%', col3 + 5, tableTop + 8, { width: col3Width - 10, align: 'center' });

      let currentY = tableTop + 25;

      // Rows
      doc.fillColor('#000000').fontSize(9).font('Helvetica');
      catData.forEach(([cat, total], index) => {
        if (currentY > doc.page.height - 100) {
          doc.addPage();
          currentY = 50;
        }

        const rowBg = index % 2 === 0 ? '#ffffff' : '#f9fafb';
        doc.rect(col1, currentY, tableWidth, 20).fill(rowBg);

        doc.fillColor('#000000');
        doc.text(cat, col1 + 5, currentY + 5, { width: col1Width - 10 });
        doc.font('Helvetica-Bold').text(fmt(total), col2 + 5, currentY + 5, { width: col2Width - 10, align: 'right' });
        doc.font('Helvetica').text(((total / totalGastos) * 100).toFixed(1) + '%', col3 + 5, currentY + 5, { width: col3Width - 10, align: 'center' });

        currentY += 20;
      });
    }

    // ===== PIE DE PÁGINA =====
    // Agregar pie de página a todas las páginas de forma segura
    try {
      const range = doc.bufferedPageRange();
      if (range && range.count > 0) {
        // Iterar desde la última página hacia atrás para evitar problemas
        for (let i = range.count - 1; i >= 0; i--) {
          try {
            doc.switchToPage(i);
            doc.fontSize(8).fillColor('#6b7280').text(
              `Página ${i + 1} de ${range.count} | ${new Date().toLocaleDateString('es-AR')}`,
              50,
              doc.page.height - 50,
              { align: 'center', width: doc.page.width - 100 }
            );
          } catch (switchError) {
            console.warn(`⚠️ No se pudo agregar pie en página ${i + 1}:`, switchError.message);
          }
        }
      }
    } catch (pageError) {
      console.warn('⚠️ No se pudo procesar pie de página:', pageError.message);
      // Agregar pie de página simple como fallback sin intentar cambiar de página
      try {
        doc.fontSize(8).fillColor('#6b7280').text(
          `Generado el ${new Date().toLocaleDateString('es-AR')}`,
          50,
          doc.page.height - 50,
          { align: 'center', width: doc.page.width - 100 }
        );
      } catch (fallbackError) {
        console.warn('⚠️ No se pudo agregar pie de página alternativo');
      }
    }

    // Finalizar PDF
    doc.end();

    console.log('✅ PDF generado exitosamente');

  } catch (error) {
    console.error('❌ Error generando PDF:', error);
    
    // Si el stream ya fue iniciado, no podemos enviar JSON
    if (!res.headersSent) {
      res.status(500).json({ 
        message: 'Error generando PDF',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    } else {
      // Si ya se enviaron headers, solo loggeamos el error
      console.error('❌ Stream ya iniciado, no se puede enviar respuesta JSON');
    }
  }
};