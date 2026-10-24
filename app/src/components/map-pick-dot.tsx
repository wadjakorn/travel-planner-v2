// The 28 px blue dot marking a picked location, shared by both pin pickers.
export function PickDot() {
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: '#0071e3',
        border: '2px solid #fff',
        boxShadow: '0 4px 12px rgba(0,113,227,0.5)',
      }}
    />
  );
}
