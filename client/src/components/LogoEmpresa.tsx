interface LogoEmpresaProps {
  logoUrl: string | null | undefined;
  nombre: string | null | undefined;
  size?: number;
}

// Insignia de marca: el logo que subió la empresa, o si no configuró uno,
// un círculo con la inicial de su nombre (mismo patrón visual de siempre).
export default function LogoEmpresa({ logoUrl, nombre, size = 28 }: LogoEmpresaProps) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={nombre || 'Logo'}
        className="object-cover shrink-0"
        style={{ width: size, height: size, borderRadius: size * 0.3 }}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center font-extrabold shrink-0 disp"
      style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: 'var(--marca-primario, #001D44)', color: '#fff', border: '1px solid var(--line-2)', fontSize: Math.round(size * 0.45) }}
    >
      {(nombre || 'M').charAt(0).toUpperCase()}
    </div>
  );
}
